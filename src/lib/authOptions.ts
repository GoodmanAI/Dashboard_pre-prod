import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  extractClientIp,
  checkIpRateLimit,
  recordLoginAttempt,
  getLockRemainingSeconds,
  handleFailedLogin,
  handleSuccessfulLogin,
  ACCOUNT_LOCK_DURATION_MS,
} from "@/lib/loginSecurity";
import { auditLog } from "@/lib/auditLog";

/**
 * Client Prisma utilisé pour les opérations d’authentification.
 * Remarque : dans une application Next.js en mode serveur, veillez à mutualiser l’instance
 * (pattern singleton) si vous rencontrez des problèmes de connexions multiples en dev.
 */
// const prisma = new PrismaClient();

/**
 * Configuration NextAuth centralisée.
 * - Fournisseur d’identifiants (email/mot de passe) adossé à Prisma.
 * - Stratégie de session basée sur JWT pour éviter le stockage serveur.
 * - Callbacks pour enrichir le token/session (id et rôle).
 * - Page de connexion personnalisée.
 */
export const authOptions: NextAuthOptions  = {
  /**
   * Déclare les fournisseurs d’authentification disponibles.
   * Ici : authentification par identifiants (credentials) vérifiés en base via Prisma.
   */
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Logique métier d'autorisation avec protections anti-bruteforce :
       *  1) Extrait l'IP depuis les headers (via reverse-proxy si dispo)
       *  2) Vérifie le rate limit IP (> 5 échecs / 15 min → refus)
       *  3) Récupère l'utilisateur par identifiant (lowercase)
       *  4) Vérifie que le compte n'est pas verrouillé (échecs récents)
       *  5) Compare le mot de passe bcrypt
       *  6) En cas d'échec : journalise + incrémente le compteur du compte,
       *     puis renvoie un message FR qui indique les tentatives restantes
       *     (à partir de 2 restantes) OU le lockout (à 0 restantes).
       *  7) En cas de succès : journalise + reset compteur
       *
       * Choix UX (2026-07-15) : on affiche les tentatives restantes pour les
       * comptes EXISTANTS. Ça casse partiellement l'anti-enumeration (un
       * attaquant peut inférer qu'un identifiant existe si le compteur
       * apparaît), mais l'expérience utilisateur légitime prime — le user
       * savait qu'il allait avoir de vrais utilisateurs qui oublient leur
       * mot de passe. Les identifiants inconnus reçoivent le message
       * générique sans compteur pour limiter la fuite.
       */
      async authorize(credentials, req) {
        const GENERIC_MSG = "Mot de passe ou identifiant incorrect, veuillez réessayer.";
        const lockDurationMinutes = Math.ceil(ACCOUNT_LOCK_DURATION_MS / 60000);

        if (!credentials) {
          throw new Error(GENERIC_MSG);
        }
        const email = credentials.email?.trim().toLowerCase();
        const password = credentials.password;
        if (!email || !password) {
          throw new Error(GENERIC_MSG);
        }

        // 1) Extraction IP — req.headers est fourni par NextAuth (v4) en second arg.
        const ip = extractClientIp((req?.headers as any) ?? {});
        const userAgent =
          (req?.headers as any)?.["user-agent"] ??
          (req?.headers as any)?.get?.("user-agent") ??
          null;

        // 2) Rate limit par IP (avant même de toucher au user en DB).
        const rate = await checkIpRateLimit(ip);
        if (rate.limited) {
          const mins = Math.ceil(rate.retryAfterSeconds / 60);
          throw new Error(
            `Trop de tentatives depuis cette adresse. Réessayez dans ${mins} minute${mins > 1 ? "s" : ""}.`
          );
        }

        // 3) Récupération user
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.password) {
          // Journaliser même l'échec sur email inexistant (pour rate limit IP).
          // Message générique (pas de compteur) pour ne pas révéler que
          // l'identifiant n'existe pas.
          await recordLoginAttempt(ip, email, false);
          auditLog("auth", "login", {
            success: false,
            errorReason: "unknown-account",
            actor: { email, ip, userAgent },
          });
          throw new Error(GENERIC_MSG);
        }

        // 4) Account lockout — vérifier AVANT de comparer le mot de passe pour
        //    ne pas dépenser de CPU bcrypt inutilement sur un compte verrouillé.
        const lockRemaining = getLockRemainingSeconds({
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
        });
        if (lockRemaining !== null) {
          await recordLoginAttempt(ip, email, false);
          auditLog("auth", "login", {
            success: false,
            errorReason: "account-locked",
            actor: { id: user.id, email, role: user.role, ip, userAgent },
            metadata: { lockRemainingSec: lockRemaining },
          });
          const mins = Math.max(1, Math.ceil(lockRemaining / 60));
          throw new Error(
            `Compte bloqué suite à trop de tentatives. Réessayez dans ${mins} minute${mins > 1 ? "s" : ""}.`
          );
        }

        // 5) Vérif bcrypt
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          await recordLoginAttempt(ip, email, false);
          const result = await handleFailedLogin(user.id);
          auditLog("auth", "login", {
            success: false,
            errorReason: result.justLocked ? "bad-password-just-locked" : "bad-password",
            actor: { id: user.id, email, role: user.role, ip, userAgent },
            metadata: { remainingAttempts: result.remainingAttempts },
          });

          if (result.justLocked) {
            throw new Error(
              `Compte bloqué suite à trop de tentatives. Réessayez dans ${lockDurationMinutes} minute${lockDurationMinutes > 1 ? "s" : ""}.`
            );
          }
          // Warning à partir de 2 tentatives restantes.
          if (result.remainingAttempts <= 2 && result.remainingAttempts > 0) {
            throw new Error(
              `Mot de passe ou identifiant incorrect. Il vous reste ${result.remainingAttempts} tentative${result.remainingAttempts > 1 ? "s" : ""} avant blocage.`
            );
          }
          throw new Error(GENERIC_MSG);
        }

        // 6) Succès : journaliser + reset état de lock
        await recordLoginAttempt(ip, email, true);
        await handleSuccessfulLogin(user.id, user.failedLoginAttempts, user.lockedUntil);
        auditLog("auth", "login", {
          success: true,
          actor: { id: user.id, email, role: user.role, ip, userAgent },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isSecretary: user.isSecretary,
          permissions: user.permissions ?? null,
          tokenVersion: user.tokenVersion ?? 0,
        };
      },
    }),
  ],

  /**
   * Gestion de session :
   * - JWT stateless côté client/serveur (pas de persistance session DB).
   * - `maxAge` : durée de vie absolue du token = 24h. Réduit le risque en cas
   *   de vol de cookie (par défaut NextAuth = 30 jours, énorme sur des
   *   comptes ADMIN).
   * - `updateAge` : renouvelle le token à chaque requête si actif depuis > 1h.
   *   Un utilisateur actif ne se voit jamais déconnecté ; un inactif l'est
   *   au bout de 24h.
   */
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,   // 24 heures
    updateAge: 60 * 60,     // 1 heure
  },

  /**
   * Paramétrage JWT :
   * - Secret issu de la configuration environnement (sécuriser en production).
   */
  jwt: {
    secret: process.env.JWT_SECRET,
  },

  /**
   * Callbacks NextAuth :
   * - jwt : enrichit le token avec l’id et le rôle de l’utilisateur lors du login.
   * - session : propage ces informations côté session (accessible depuis le client).
   */
  callbacks: {
    async jwt({ token, user }) {
      // Login initial : hydratation depuis authorize()
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isSecretary = user.isSecretary ?? false;
        token.permissions = (user as any).permissions ?? null;
        token.tokenVersion = (user as any).tokenVersion ?? 0;
        return token;
      }

      // Refresh : verifier tokenVersion + rehydrate permissions
      // (permissions peut changer sans reconnexion via edit sous-compte).
      // On rehydrate a chaque appel jwt (declanche par updateAge=1h ou
      // updateSession cote client). Faible cout : findUnique par id.
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as number },
          select: {
            role: true,
            isSecretary: true,
            permissions: true,
            tokenVersion: true,
          },
        });

        // User supprime -> token invalide
        if (!dbUser) {
          return {} as typeof token;
        }

        // Kick a distance : tokenVersion DB > tokenVersion JWT -> invalide
        const currentVersion = dbUser.tokenVersion ?? 0;
        const jwtVersion = (token.tokenVersion as number | undefined) ?? 0;
        if (currentVersion > jwtVersion) {
          return {} as typeof token;
        }

        // Rehydrate role/isSecretary/permissions (peuvent changer sans logout)
        token.role = dbUser.role;
        token.isSecretary = dbUser.isSecretary;
        token.permissions = dbUser.permissions;
        token.tokenVersion = currentVersion;
      }

      return token;
    },
    async session({ session, token }) {
      // Si le jwt callback a vide le token (revocation), on renvoie une
      // session sans user pour que useSession() cote client bascule en
      // "unauthenticated" au prochain refresh.
      if (!token?.id) {
        return { ...session, user: null as any };
      }
      session.user = {
        ...session.user,
        id: token.id as number,
        role: token.role as "SUPER_ADMIN" | "ADMIN" | "CLIENT",
        isSecretary: (token.isSecretary as boolean | undefined) ?? false,
        permissions: token.permissions ?? null,
        tokenVersion: (token.tokenVersion as number | undefined) ?? 0,
      };
      return session;
    },
  },

  /**
   * Pages personnalisées :
   * - Redirige la page de connexion vers notre route dédiée.
   */
  pages: {
    signIn: "/authentication/signin",
  },

  /**
   * Mode debug :
   * - Active les logs NextAuth utiles en développement (verbose).
   * - Désactivé en production pour ne pas leaker de données sensibles dans
   *   les logs PM2 accessibles par SSH (JWT partiels, erreurs internes…).
   */
  debug: process.env.NODE_ENV !== "production",
};

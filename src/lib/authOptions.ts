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
} from "@/lib/loginSecurity";

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
       *  3) Récupère l'utilisateur par email
       *  4) Vérifie que le compte n'est pas verrouillé (échecs récents)
       *  5) Compare le mot de passe bcrypt
       *  6) En cas d'échec : journalise + incrémente le compteur du compte
       *  7) En cas de succès : journalise + reset compteur
       *
       * Messages d'erreur volontairement génériques ("Invalid credentials") pour
       * ne pas révéler l'existence d'un compte (attaque de reconnaissance).
       */
      async authorize(credentials, req) {
        if (!credentials) {
          throw new Error("Invalid credentials");
        }
        const email = credentials.email?.trim().toLowerCase();
        const password = credentials.password;
        if (!email || !password) {
          throw new Error("Invalid credentials");
        }

        // 1) Extraction IP — req.headers est fourni par NextAuth (v4) en second arg.
        const ip = extractClientIp((req?.headers as any) ?? {});

        // 2) Rate limit par IP (avant même de toucher au user en DB).
        const rate = await checkIpRateLimit(ip);
        if (rate.limited) {
          const mins = Math.ceil(rate.retryAfterSeconds / 60);
          throw new Error(
            `Trop de tentatives. Réessayez dans ${mins} minute${mins > 1 ? "s" : ""}.`
          );
        }

        // 3) Récupération user
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.password) {
          // Journaliser même l'échec sur email inexistant (pour rate limit IP).
          await recordLoginAttempt(ip, email, false);
          throw new Error("Invalid credentials");
        }

        // 4) Account lockout — vérifier AVANT de comparer le mot de passe pour
        //    ne pas dépenser de CPU bcrypt inutilement sur un compte verrouillé.
        const lockRemaining = getLockRemainingSeconds({
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
        });
        if (lockRemaining !== null) {
          await recordLoginAttempt(ip, email, false);
          const mins = Math.ceil(lockRemaining / 60);
          throw new Error(
            `Compte temporairement verrouillé. Réessayez dans ${mins} minute${mins > 1 ? "s" : ""}.`
          );
        }

        // 5) Vérif bcrypt
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          await recordLoginAttempt(ip, email, false);
          await handleFailedLogin(user.id);
          throw new Error("Invalid credentials");
        }

        // 6) Succès : journaliser + reset état de lock
        await recordLoginAttempt(ip, email, true);
        await handleSuccessfulLogin(user.id, user.failedLoginAttempts, user.lockedUntil);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isSecretary: user.isSecretary,
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
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isSecretary = user.isSecretary ?? false;
      } else if (token.id && typeof token.isSecretary === "undefined") {
        // Re-hydrate isSecretary depuis la BDD pour les sessions
        // créées avant l'ajout du flag (token JWT antérieur).
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as number },
          select: { isSecretary: true },
        });
        token.isSecretary = dbUser?.isSecretary ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as number,
          role: token.role as "ADMIN" | "CLIENT",
          isSecretary: (token.isSecretary as boolean | undefined) ?? false,
        };
      }
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

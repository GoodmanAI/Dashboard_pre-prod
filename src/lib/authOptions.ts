import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Client Prisma utilisé pour les opérations d’authentification.
 * Remarque : dans une application Next.js en mode serveur, veillez à mutualiser l’instance
 * (pattern singleton) si vous rencontrez des problèmes de connexions multiples en dev.
 */
const prisma = new PrismaClient();

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
       * Logique métier d’autorisation :
       * 1) Valide la présence des identifiants.
       * 2) Récupère l’utilisateur par email.
       * 3) Compare le mot de passe fourni avec le hash stocké (bcrypt).
       * 4) Retourne un objet utilisateur minimal pour sérialisation dans le JWT.
       * En cas d’échec, une erreur est levée pour interrompre le flux.
       */
      async authorize(credentials) {
        if (!credentials) {
          throw new Error("No credentials provided");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Invalid email or password");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],

  /**
   * Gestion de session :
   * - Utilise des JWT stateless côté client/serveur (pas de persistance session DB).
   */
  session: {
    strategy: "jwt",
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as number,
          role: token.role as "ADMIN" | "CLIENT",
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
   * - Active les logs NextAuth utiles en développement.
   * - À désactiver en production pour limiter la verbosité.
   */
  debug: true,
};

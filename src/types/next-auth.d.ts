import NextAuth from "next-auth";

/**
 * Type des roles utilisateur en session.
 * SUPER_ADMIN a ete ajoute au chantier 3 (Lot A). Il herite de toutes les
 * capacites ADMIN + peut creer/supprimer des ADMIN et gerer les sous-comptes
 * CLIENT avec permissions granulaires.
 */
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "CLIENT";

declare module "next-auth" {
  interface User {
    id: number;
    name: string | null;
    email: string;
    role: UserRole;
    isSecretary?: boolean;
    /** Override permissions granulaire (chantier 3). null = acces complet du role. */
    permissions?: unknown;
    /** Compteur de version JWT pour revocation a distance. */
    tokenVersion?: number;
  }

  interface Session {
    user: {
      id: number;
      name: string | null;
      email: string;
      role: UserRole;
      isSecretary?: boolean;
      permissions?: unknown;
      tokenVersion?: number;
    };
  }

  interface JWT {
    id: number;
    role: UserRole;
    name: string | null;
    email: string;
    isSecretary?: boolean;
    permissions?: unknown;
    tokenVersion?: number;
  }
}

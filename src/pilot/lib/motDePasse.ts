import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Mots de passe des comptes de l'équipe : le hachage du Dashboard (`bcryptjs`,
 * coût 10, comme `/api/admin/users` et `/api/admin/create-client`). La connexion
 * passe par `authOptions` du Dashboard, qui compare avec `bcrypt.compare` : un
 * compte créé depuis l'écran Équipe de Pilot se connecte aux deux espaces.
 * L'ancien format local `scrypt$...` de la livraison n'a jamais existé en production.
 */
const COUT = 10;

export async function hacherMotDePasse(mot: string): Promise<string> {
  return bcrypt.hash(mot, COUT);
}

/** Vrai si `mot` correspond à l'empreinte bcrypt `stocke`. Toute autre forme est refusée. */
export async function verifierMotDePasse(mot: string, stocke: string): Promise<boolean> {
  if (!/^\$2[aby]\$\d{2}\$/.test(stocke)) return false;
  return bcrypt.compare(mot, stocke);
}

/** Sans 0/O, 1/l/I : un mot de passe provisoire se recopie à la main sans erreur. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Un mot de passe provisoire (C-64) : trois groupes de cinq signes tirés par
 * `randomInt` (environ 86 bits), avec au moins une majuscule, une minuscule et un
 * chiffre. Montré une seule fois au super-administrateur, jamais journalisé ni
 * stocké en clair. Son titulaire le remplace dans Mon compte.
 */
export function motDePasseProvisoire(): string {
  for (;;) {
    const mot = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");
    if (/[A-Z]/.test(mot) && /[a-z]/.test(mot) && /[0-9]/.test(mot)) return mot;
  }
}

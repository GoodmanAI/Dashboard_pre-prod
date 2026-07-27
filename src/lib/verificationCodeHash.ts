import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Hash + verification pour les codes 6 chiffres envoyes aux patients.
 *
 * Choix crypto : scrypt (RFC 7914) via le module `crypto` builtin de Node.
 * Pas de dependance externe. Parametres par defaut de Node : N=16384, r=8,
 * p=1, cost ~= 64ms sur un CPU moderne, largement au-dessus du budget de
 * force brute realiste pour un code a 3 essais max.
 *
 * Format de stockage en DB : `"salt_hex:hash_hex"` (chaine unique, colonne
 * text). Le sel est genere aleatoirement par code (16 bytes) — donc deux
 * codes identiques cote patient produisent des hashes differents en DB.
 *
 * Utilisation :
 *
 *   const hash = hashVerificationCode("123456");
 *   // → "a1b2c3...:4f5e6d..."
 *
 *   if (verifyVerificationCode("123456", hash)) {  ... }
 */

const KEY_LENGTH = 32;   // 32 bytes = 256 bits, standard pour scrypt output
const SALT_LENGTH = 16;  // 16 bytes = 128 bits d'entropie de sel

export function hashVerificationCode(code: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(code, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Compare le code fourni au hash stocke. Utilise `timingSafeEqual` pour
 * eviter les attaques par mesure de temps (meme si a 3 essais max le
 * risque est theorique).
 *
 * Renvoie `false` si le format du hash est corrompu (ne throw pas —
 * l'appelant traite comme "code incorrect").
 */
export function verifyVerificationCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  let expectedHash: Buffer;
  let candidateHash: Buffer;
  try {
    const salt = Buffer.from(saltHex, "hex");
    expectedHash = Buffer.from(hashHex, "hex");
    if (expectedHash.length !== KEY_LENGTH) return false;
    candidateHash = scryptSync(code, salt, KEY_LENGTH);
  } catch {
    return false;
  }

  return timingSafeEqual(expectedHash, candidateHash);
}

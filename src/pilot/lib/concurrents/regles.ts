import type { CrmEtapeCommerciale, CrmTypeConcurrent } from "@prisma/client";
import { ETAPES_COMMERCIALES } from "@/pilot/lib/pipeline";

/**
 * Les règles pures des concurrents (lot R) : rien ici ne lit la base ni
 * l'horloge. Le service et les lectures s'y appuient, les tests les couvrent.
 */

export const LIBELLES_TYPE_CONCURRENT: Record<CrmTypeConcurrent, string> = {
  ROBOT_VOCAL: "Robot vocal", CENTRE_APPELS: "Centre d'appels",
  SECRETARIAT_EXTERNALISE: "Secrétariat externalisé", EDITEUR_RDV: "Éditeur de prise de rendez-vous", AUTRE: "Autre",
};

/** Les caractères de largeur nulle (espace, liaisons, joint de mots, marque d'ordre des octets) : invisibles, ils feraient deux noms d'un seul. */
const LARGEUR_NULLE = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Le nom tel qu'on l'enregistre : caractères de largeur nulle retirés, espaces
 * de bord retirés, espaces répétés (insécables, fines, idéographiques
 * comprises) ramenés à un seul. Un nom qui ne contenait que cela devient vide.
 */
export function nettoyerNom(nom: string): string {
  return nom.replace(LARGEUR_NULLE, "").normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * La clé de comparaison de deux noms : sans tenir compte de la casse ni des
 * espaces en trop. « Robot  ALPHA voix » et « robot alpha voix » sont le même
 * concurrent. L'apostrophe typographique vaut l'apostrophe droite. Les accents
 * comptent : « Éditeur » et « Editeur » restent deux noms.
 */
export function cleDeNom(nom: string): string {
  return nettoyerNom(nom).replace(/[\u2018\u2019\u02BC]/g, "'").toLocaleLowerCase("fr");
}

/** Le premier concurrent dont le nom est celui-là, hors `sauf` (le concurrent qu'on renomme). */
export function trouverDoublon<T extends { id: number; nom: string }>(existants: readonly T[], nom: string, sauf?: number): T | null {
  const cle = cleDeNom(nom);
  return existants.find((c) => c.id !== sauf && cleDeNom(c.nom) === cle) ?? null;
}

export const MESSAGE_DOUBLON = "Un concurrent porte déjà ce nom. Ouvrez sa fiche plutôt que d'en créer une seconde.";

/**
 * Le plus récent d'abord : par date du relevé, puis par identifiant à date
 * égale. C'est aussi l'ordre de l'index de la base : le premier est en vigueur.
 */
export function ordreReleves(a: { releveLe: Date; id: number }, b: { releveLe: Date; id: number }): number {
  return +b.releveLe - +a.releveLe || b.id - a.id;
}

/** Les relevés du plus récent au plus ancien, le premier marqué « en vigueur ». Calculé à la lecture, jamais stocké. */
export function marquerEnVigueur<T extends { releveLe: Date; id: number }>(releves: readonly T[]): (T & { enVigueur: boolean })[] {
  return [...releves].sort(ordreReleves).map((r, i) => ({ ...r, enVigueur: i === 0 }));
}

/** Les étapes d'un dossier avant signature : seules à porter un forçage de température. C'est `ETAPES_COMMERCIALES`, une seule source. */
export const ETAPES_AVANT_SIGNATURE: readonly CrmEtapeCommerciale[] = ETAPES_COMMERCIALES;
export function forcagePossible(etape: CrmEtapeCommerciale): boolean {
  return ETAPES_AVANT_SIGNATURE.includes(etape);
}
export const MESSAGE_FORCAGE_IMPOSSIBLE = "La température ne se force que sur un dossier avant signature.";

/** Une organisation liée à un concurrent, en place ou gagnante : le refus de suppression le dit. */
export function messageSuppressionRefusee(organisations: number): string {
  return organisations > 1
    ? `${organisations} organisations sont liées à ce concurrent. Retirez ces liens avant de le supprimer.`
    : "Une organisation est liée à ce concurrent. Retirez ce lien avant de le supprimer.";
}

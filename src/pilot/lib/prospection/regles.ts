import type { CrmPriorite, CrmTypeEchange } from "@prisma/client";
import { debutDuJour } from "@/pilot/lib/dates";

/**
 * Règles pures de la prospection (CHOIX.md, C-65) : priorité, région déduite du
 * code postal, état de contact d'un prospect, détection des doublons à la saisie.
 * Servent à l'écran « À prospecter », à la fiche de saisie et aux tests.
 */

/** Libellés de la priorité, dans l'ordre du tri : A+ d'abord. */
export const PRIORITES: Record<CrmPriorite, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };
export const ORDRE_PRIORITES = Object.keys(PRIORITES) as CrmPriorite[];

/** Les canaux proposés pour noter le premier contact d'un prospect. */
export const CANAUX_PREMIER_CONTACT = ["APPEL", "MAIL", "LINKEDIN", "VISITE", "VISIO_POURPARLERS", "DEMO"] as const satisfies readonly CrmTypeEchange[];

/** Minuscules, sans accents ni ponctuation : « Saint-Étienne » devient « saint etienne ». */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Les mots que partagent presque tous les noms d'établissements : ils ne distinguent rien.
const MOTS_VIDES = new Set(("centre centres hospitalier hospitaliere hospitaliers hopital hopitaux imagerie imageries medicale medicales medical "
  + "radiologie radiologique radiologiques radiologues radiologue radio cabinet cabinets groupe groupement clinique cliniques polyclinique "
  + "sante pole institut service services site sites irm scanner cim ch chu chi gh ght scm sel selas selarl sas sarl gie "
  + "de du des la le les et en sur sous au aux un une pour par ex the saint sainte st ste").split(" "));

/** Les mots qui distinguent un établissement : « CH de Cornouaille (Quimper) » donne cornouaille et quimper. */
export function motsSignificatifs(nom: string): string[] {
  return [...new Set(normaliser(nom).split(" ").filter((m) => m.length >= 3 && !MOTS_VIDES.has(m)))];
}

/** À partir de ce score, la fiche de saisie montre le candidat comme doublon possible. */
export const SEUIL_DOUBLON = 0.6;

/**
 * Part des mots saisis qu'on retrouve chez le candidat, de 0 à 1. La ville ne
 * suffit jamais seule (une clinique de Saint-Étienne n'est pas le CHU) ; elle
 * départage quand le nom concorde déjà.
 */
export function scoreDoublon(saisi: { nom: string; ville?: string | null }, candidat: { nom: string; villes: (string | null)[] }): number {
  if (normaliser(saisi.nom) && normaliser(saisi.nom) === normaliser(candidat.nom)) return 1;
  const mots = motsSignificatifs(saisi.nom);
  if (!mots.length) return 0;
  const chezLui = new Set([...motsSignificatifs(candidat.nom), ...candidat.villes.flatMap((v) => (v ? motsSignificatifs(v) : []))]);
  const communs = mots.filter((m) => chezLui.has(m));
  // Seuls les mots de la ville saisie concordent : ce n'est pas le même établissement.
  const motsVille = new Set(saisi.ville ? motsSignificatifs(saisi.ville) : []);
  if (!communs.some((m) => !motsVille.has(m))) return 0;
  const ville = saisi.ville ? normaliser(saisi.ville) : "";
  const memeVille = !!ville && candidat.villes.some((v) => v && normaliser(v) === ville);
  return Math.min(1, communs.length / mots.length + (memeVille ? 0.2 : 0));
}

/** Département d'un code postal français : 13008 → 13, 20200 → 2B, 97200 → 972. Null hors de France. */
export function departementDuCodePostal(codePostal: string | null | undefined): string | null {
  const cp = codePostal?.replace(/\s/g, "") ?? "";
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("97")) return cp.slice(0, 3);
  if (cp.startsWith("98")) return null; // Monaco et collectivités du Pacifique
  if (cp.startsWith("20")) return Number(cp.slice(0, 3)) < 202 ? "2A" : "2B";
  return cp.slice(0, 2);
}

/** Les régions, dans l'ordre alphabétique, avec leurs départements. */
export const REGIONS = {
  ARA: { nom: "Auvergne-Rhône-Alpes", departements: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"] },
  BFC: { nom: "Bourgogne-Franche-Comté", departements: ["21", "25", "39", "58", "70", "71", "89", "90"] },
  BRE: { nom: "Bretagne", departements: ["22", "29", "35", "56"] },
  CVL: { nom: "Centre-Val de Loire", departements: ["18", "28", "36", "37", "41", "45"] },
  COR: { nom: "Corse", departements: ["2A", "2B"] },
  GES: { nom: "Grand Est", departements: ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"] },
  GUA: { nom: "Guadeloupe", departements: ["971"] },
  GUY: { nom: "Guyane", departements: ["973"] },
  HDF: { nom: "Hauts-de-France", departements: ["02", "59", "60", "62", "80"] },
  IDF: { nom: "Île-de-France", departements: ["75", "77", "78", "91", "92", "93", "94", "95"] },
  REU: { nom: "La Réunion", departements: ["974"] },
  MAR: { nom: "Martinique", departements: ["972"] },
  MAY: { nom: "Mayotte", departements: ["976"] },
  NOR: { nom: "Normandie", departements: ["14", "27", "50", "61", "76"] },
  NAQ: { nom: "Nouvelle-Aquitaine", departements: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] },
  OCC: { nom: "Occitanie", departements: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"] },
  PDL: { nom: "Pays de la Loire", departements: ["44", "49", "53", "72", "85"] },
  PAC: { nom: "Provence-Alpes-Côte d'Azur", departements: ["04", "05", "06", "13", "83", "84"] },
} as const;
export type CleRegion = keyof typeof REGIONS;

export function regionDuCodePostal(codePostal: string | null | undefined): CleRegion | null {
  const dep = departementDuCodePostal(codePostal);
  if (!dep) return null;
  return (Object.keys(REGIONS) as CleRegion[]).find((r) => (REGIONS[r].departements as readonly string[]).includes(dep)) ?? null;
}

/** Les débuts de code postal d'une région, pour filtrer en base : la Corse se lit sur trois chiffres. */
export function prefixesCodePostal(region: CleRegion): string[] {
  return REGIONS[region].departements.flatMap((d) => (d === "2A" ? ["200", "201"] : d === "2B" ? ["202", "203", "204", "205", "206"] : [d]));
}

/** Valeur de filtre pour « non renseigné » : la case vide se cherche aussi. */
export const INCONNU = "inconnu";

export type EtatProspection = "JAMAIS" | "A_RELANCER" | "CONTACTE";
export const LIBELLES_ETAT: Record<EtatProspection, string> = { JAMAIS: "Jamais contacté", A_RELANCER: "À relancer", CONTACTE: "Contacté" };

/** Une prochaine action passée l'emporte : le prospect est à relancer, contacté ou non. */
export function etatProspection(o: { dernierEchangeLe: Date | null; prochaineActionLe: Date | null }, maintenant: Date): EtatProspection {
  if (o.prochaineActionLe && o.prochaineActionLe < debutDuJour(maintenant)) return "A_RELANCER";
  return o.dernierEchangeLe ? "CONTACTE" : "JAMAIS";
}

/** « aujourd'hui », « hier », « il y a 12 j », « il y a 3 mois », « il y a 2 ans ». */
export function ilYA(date: Date, maintenant: Date): string {
  const jours = Math.floor((debutDuJour(maintenant).getTime() - debutDuJour(date).getTime()) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  if (jours < 60) return `il y a ${jours} j`;
  if (jours < 730) return `il y a ${Math.floor(jours / 30.44)} mois`;
  return `il y a ${Math.floor(jours / 365.25)} ans`;
}

/** Ce que l'ordre de la liste « À prospecter » lit d'un prospect. */
export type PourTri = { priorite: CrmPriorite | null; prochaineActionLe: Date | null; dernierEchangeLe: Date | null; nom: string };

const plusAncienDabord = (a: Date | null, b: Date | null, videAvant: boolean): number => {
  if (a === null || b === null) return a === b ? 0 : (a === null ? -1 : 1) * (videAvant ? 1 : -1);
  return +a - +b;
};

/**
 * L'ordre de base de la liste, le même que celui de la requête : les priorités hautes
 * d'abord, puis les relances les plus anciennes (sans relance en dernier), puis les
 * prospects jamais contactés avant les autres, puis le nom. Sert quand la liste se
 * trie en mémoire, par exemple par température.
 */
export function comparerProspects(a: PourTri, b: PourTri): number {
  const rang = (p: CrmPriorite | null) => (p === null ? ORDRE_PRIORITES.length : ORDRE_PRIORITES.indexOf(p));
  return rang(a.priorite) - rang(b.priorite)
    || plusAncienDabord(a.prochaineActionLe, b.prochaineActionLe, false)
    || plusAncienDabord(a.dernierEchangeLe, b.dernierEchangeLe, true)
    || a.nom.localeCompare(b.nom, "fr");
}

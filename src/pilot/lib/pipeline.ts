import type { CrmEtapeCommerciale, CrmRaisonSortie, CrmAttitude } from "@prisma/client";

export const SEUIL_VIEILLISSEMENT: Partial<Record<CrmEtapeCommerciale, number | null>> = {
  PROSPECT: 21, POURPARLERS: 30, VISIO_TECHNIQUE: 21, PROPOSITION: 30, EN_POC: null, POC_NON_TRANSFORME: null, SIGNE: 14, EN_INTEGRATION: 90,
};
export function joursDansEtape(etapeDepuisLe: Date, maintenant: Date): number {
  return Math.max(0, Math.floor((maintenant.getTime() - etapeDepuisLe.getTime()) / 86400000));
}
export function vieillissement(etape: CrmEtapeCommerciale, etapeDepuisLe: Date, maintenant: Date) {
  const jours = joursDansEtape(etapeDepuisLe, maintenant);
  const seuil = SEUIL_VIEILLISSEMENT[etape] ?? null;
  return { jours, seuil, depasse: seuil !== null && jours > seuil };
}
export const LIBELLES_RAISONS: Record<CrmRaisonSortie, string> = {
  PRIX: "Prix", CONCURRENT: "Concurrent", PAS_DE_BUDGET: "Pas de budget", RIS_INCOMPATIBLE: "RIS incompatible",
  TIMING: "Calendrier", SANS_REPONSE: "Sans réponse", AUTRE: "Autre",
};
export const LIBELLES_ATTITUDE: Record<CrmAttitude, string> = {
  SOUTIEN: "Soutien", NEUTRE: "Neutre", OPPOSANT: "Opposant", INCONNU: "À préciser",
};

/**
 * Le cycle de vie d'une organisation, repris du dossier produit : quatre étapes
 * commerciales, quatre étapes de livraison et de vie du client, plus deux
 * sorties possibles à tout moment (Perdu, En sommeil), avec la raison notée.
 *
 * L'ordre de ce tableau est l'ordre des colonnes du Pipeline.
 */

export const ETAPES_COMMERCIALES: CrmEtapeCommerciale[] = [
  "PROSPECT",
  "POURPARLERS",
  "VISIO_TECHNIQUE",
  "PROPOSITION",
  "EN_POC",
];

export const ETAPES_LIVRAISON: CrmEtapeCommerciale[] = [
  "SIGNE",
  "EN_INTEGRATION",
  "EN_PRODUCTION",
  "ARRETE",
];

export const ETAPES_SORTIE: CrmEtapeCommerciale[] = ["PERDU", "EN_SOMMEIL", "POC_NON_TRANSFORME"];

export const LIBELLES: Record<CrmEtapeCommerciale, string> = {
  PROSPECT: "Prospect",
  POURPARLERS: "Premiers échanges",
  VISIO_TECHNIQUE: "Étude technique",
  PROPOSITION: "Devis envoyé",
  EN_POC: "En POC",
  POC_NON_TRANSFORME: "POC non transformé",
  SIGNE: "Signé",
  EN_INTEGRATION: "Mise en service",
  EN_PRODUCTION: "En service",
  ARRETE: "Contrat terminé",
  PERDU: "Perdu",
  EN_SOMMEIL: "En pause",
};

/** Les noms d'avant C-54, encore reconnus par l'import CSV. Jamais affichés. */
export const ANCIENS_LIBELLES: Record<CrmEtapeCommerciale, string> = {
  PROSPECT: "Prospect", POURPARLERS: "Pourparlers", VISIO_TECHNIQUE: "Visio technique", PROPOSITION: "Proposition",
  SIGNE: "Signé", EN_INTEGRATION: "En intégration", EN_PRODUCTION: "En production", ARRETE: "Arrêté",
  PERDU: "Perdu", EN_SOMMEIL: "En sommeil", EN_POC: "En POC", POC_NON_TRANSFORME: "POC non transformé",
};

export const SOUS_TITRES: Record<CrmEtapeCommerciale, string> = {
  PROSPECT: "à contacter ou à qualifier",
  POURPARLERS: "première visio faite",
  VISIO_TECHNIQUE: "accès au RIS, faisabilité",
  PROPOSITION: "le client décide",
  EN_POC: "test avant la signature",
  POC_NON_TRANSFORME: "test terminé sans signature, raison notée",
  SIGNE: "contrat signé, à lancer",
  EN_INTEGRATION: "installation site par site",
  EN_PRODUCTION: "le centre utilise Lyrae",
  ARRETE: "le client est parti",
  PERDU: "affaire perdue, raison notée",
  EN_SOMMEIL: "à relancer plus tard",
};

/**
 * Probabilité par défaut d'une étape. Elle sert tant qu'un humain n'a pas
 * corrigé la probabilité de l'opportunité ; à partir de là, `probabiliteForcee`
 * empêche l'étape de l'écraser.
 */
export const PROBABILITE_PAR_ETAPE: Record<CrmEtapeCommerciale, number> = {
  PROSPECT: 10,
  POURPARLERS: 25,
  VISIO_TECHNIQUE: 45,
  PROPOSITION: 65,
  EN_POC: 80,
  POC_NON_TRANSFORME: 0,
  SIGNE: 100,
  EN_INTEGRATION: 100,
  EN_PRODUCTION: 100,
  ARRETE: 0,
  PERDU: 0,
  EN_SOMMEIL: 5,
};

/**
 * La probabilité qui compte pour une opportunité : la sienne si un humain l'a
 * corrigée, sinon celle de l'étape actuelle de l'organisation (C-44). La fiche,
 * l'onglet Négociation et le tableau Prospects lisent tous cette fonction.
 */
export function probabiliteEffective(o: { probabilite: number; probabiliteForcee: boolean }, etape: CrmEtapeCommerciale): number {
  return o.probabiliteForcee ? o.probabilite : PROBABILITE_PAR_ETAPE[etape];
}

/** Les étapes qui comptent comme « client », par opposition à « prospect ». */
export function estClient(etape: CrmEtapeCommerciale): boolean {
  return (
    etape === "SIGNE" ||
    etape === "EN_INTEGRATION" ||
    etape === "EN_PRODUCTION"
  );
}

/**
 * La rubrique d'une organisation (C-87) : un client dès la signature, contrat
 * terminé compris ; sinon un prospect, y compris perdu ou en pause, puisqu'il
 * n'a jamais signé. La fiche, son fil d'Ariane et la page Clients s'y fient.
 */
export type Rubrique = "prospects" | "clients";
export function rubriqueDe(etape: CrmEtapeCommerciale): Rubrique {
  return ETAPES_LIVRAISON.includes(etape) ? "clients" : "prospects";
}
export const RUBRIQUES: Record<Rubrique, { libelle: string; href: string }> = {
  prospects: { libelle: "Prospects", href: "/pilot/pipeline" },
  clients: { libelle: "Clients", href: "/pilot/organisations" },
};

/**
 * Un dossier perdu, en pause ou au contrat terminé ne suit plus de mise en
 * service : ses centres ne lèvent plus d'alerte d'étape, d'appel ou de date (C-86).
 */
export function suitLaMiseEnService(etape: CrmEtapeCommerciale): boolean {
  return etape !== "ARRETE" && !ETAPES_SORTIE.includes(etape);
}

/**
 * Une transition est permise si elle avance, recule d'un cran, ou sort.
 * `avantSortie` : l'étape d'où le dossier est sorti (Perdu, En pause). Il y
 * revient d'un geste, sans refaire tout le chemin depuis Prospect (C-86).
 */
export function transitionPermise(
  depuis: CrmEtapeCommerciale,
  vers: CrmEtapeCommerciale,
  avantSortie: CrmEtapeCommerciale | null = null,
): boolean {
  if (depuis === vers) return true;
  // Le POC précède la signature. Un client ne revient pas en test avant vente.
  if (depuis === "SIGNE" && vers === "EN_POC") return false;
  if (vers === "POC_NON_TRANSFORME") return depuis === "EN_POC" || ETAPES_SORTIE.includes(depuis) && avantSortie === "EN_POC";
  if (depuis === "PROPOSITION" && vers === "SIGNE" || depuis === "SIGNE" && vers === "PROPOSITION") return true;
  if (ETAPES_SORTIE.includes(depuis) && avantSortie && !ETAPES_SORTIE.includes(avantSortie) && vers === avantSortie) return true;
  // Toute étape peut sortir en Perdu ou En sommeil.
  if (ETAPES_SORTIE.includes(vers)) return true;
  // Reconquête : un client arrêté, perdu ou en sommeil redevient un prospect.
  if (
    (depuis === "ARRETE" || ETAPES_SORTIE.includes(depuis)) &&
    vers === "PROSPECT"
  ) {
    return true;
  }
  const ordre = [...ETAPES_COMMERCIALES, ...ETAPES_LIVRAISON];
  const i = ordre.indexOf(depuis);
  const j = ordre.indexOf(vers);
  if (i === -1 || j === -1) return false;
  return j === i + 1 || j === i - 1;
}

/**
 * Les étapes à franchir pour convertir en client, Signé inclus, une à une :
 * `transitionPermise` n'autorise qu'un pas à la fois et la conversion ne la
 * contourne jamais. `null` depuis Signé et après, et depuis une sortie.
 */
export function cheminVersSigne(depuis: CrmEtapeCommerciale): CrmEtapeCommerciale[] | null {
  const i = ETAPES_COMMERCIALES.indexOf(depuis);
  if (i === -1) return null;
  // Le POC reste facultatif, y compris dans une conversion rapide.
  return [...ETAPES_COMMERCIALES.slice(i + 1).filter((e) => e !== "EN_POC"), "SIGNE"];
}

/** Destinations effectives, dans l'ordre des colonnes. Rester sur place n'est pas un déplacement. */
export function destinationsPermises(depuis: CrmEtapeCommerciale): CrmEtapeCommerciale[] {
  return [...ETAPES_COMMERCIALES, ...ETAPES_LIVRAISON, ...ETAPES_SORTIE].filter((vers) => vers !== depuis && transitionPermise(depuis, vers));
}
export type MouvementPipeline = { vers: CrmEtapeCommerciale; depuis: CrmEtapeCommerciale };
export function appliquerEnCours<T extends { id: number; etape: string }>(cartes: readonly T[], enCours: ReadonlyMap<number, MouvementPipeline>): T[] {
  return cartes.map((carte) => {
    const mouvement = enCours.get(carte.id);
    return mouvement ? { ...carte, etape: mouvement.vers } : carte;
  });
}

/**
 * L'étape d'avant la sortie, lue dans le journal des changements d'étape, du
 * plus récent au plus ancien : on remonte les passages entre Perdu et En pause
 * jusqu'à la dernière étape hors sortie. Null si le journal ne la dit pas.
 */
export function etapeAvantSortie(
  etapeActuelle: CrmEtapeCommerciale,
  changements: readonly { avant: unknown; apres: unknown }[],
): CrmEtapeCommerciale | null {
  if (!ETAPES_SORTIE.includes(etapeActuelle)) return null;
  let cherchee: CrmEtapeCommerciale = etapeActuelle;
  for (const c of changements) {
    const apres = (c.apres as { etape?: CrmEtapeCommerciale } | null)?.etape;
    const avant = (c.avant as { etape?: CrmEtapeCommerciale } | null)?.etape;
    if (apres !== cherchee || !avant) continue;
    if (!ETAPES_SORTIE.includes(avant)) return avant;
    cherchee = avant;
  }
  return null;
}

import type { CrmCleEtape } from "@prisma/client";
import { CHECKLIST, type DefinitionEtape } from "@/pilot/lib/checklist/definition";
import { compter } from "@/pilot/lib/texte";

/**
 * Reprise du parc (CHOIX.md, C-60). Règles pures : regrouper les accès du
 * Dashboard qu'aucun centre de Pilot ne suit, proposer une étape, et dire quelles
 * étapes de mise en service un humain peut déclarer faites avant Pilot.
 */

/** Une organisation reprise entre directement à l'une de ces étapes. */
export const ETAPES_REPRISE = ["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const;
export type EtapeReprise = (typeof ETAPES_REPRISE)[number];

/** Le statut que le Dashboard déclare pour un centre en service. */
export const STATUT_EN_SERVICE = "EN_PRODUCTION";

/** Un accès produit d'un compte du Dashboard, tel que la requête le lit. */
export type LigneAcces = {
  userProductId: number; productId: number; produit: string;
  userId: number; email: string; nom: string | null;
  organisationId: number | null; organisationNom: string | null;
  ecarteRaison: string | null; ecarteLe: Date | null;
};
/** Ce que le registre de complétude dit de cet accès, par l'adaptateur (C-04). */
export type EtatAcces = { statutCentre: string; dernierAppelLe: Date | null };

export type AccesLibre = {
  userProductId: number; productId: number; produit: string;
  statutCentre: string | null; dernierAppelLe: Date | null;
};
export type CompteARelier = {
  userId: number; email: string; nom: string | null;
  organisation: { id: number; nom: string } | null;
  ecarte: { raison: string; le: Date } | null;
  acces: AccesLibre[];
};

const enService = (c: CompteARelier) => c.acces.some((a) => a.statutCentre === STATUT_EN_SERVICE);
const dernierAppel = (c: CompteARelier) => Math.max(0, ...c.acces.map((a) => a.dernierAppelLe?.getTime() ?? 0));

/**
 * Un compte par ligne, ses accès libres dessous. Les comptes en service d'abord :
 * ce sont des clients qui vivent déjà sans que Pilot les voie. Puis le plus
 * récemment appelé, puis l'ordre alphabétique.
 */
export function grouperComptes(lignes: LigneAcces[], etats: ReadonlyMap<number, EtatAcces>): CompteARelier[] {
  const comptes = new Map<number, CompteARelier>();
  for (const l of lignes) {
    const compte = comptes.get(l.userId) ?? {
      userId: l.userId, email: l.email, nom: l.nom,
      organisation: l.organisationId === null ? null : { id: l.organisationId, nom: l.organisationNom ?? "" },
      ecarte: l.ecarteRaison === null ? null : { raison: l.ecarteRaison, le: l.ecarteLe ?? new Date(0) },
      acces: [],
    };
    const etat = etats.get(l.userProductId);
    compte.acces.push({ userProductId: l.userProductId, productId: l.productId, produit: l.produit,
      statutCentre: etat?.statutCentre ?? null, dernierAppelLe: etat?.dernierAppelLe ?? null });
    comptes.set(l.userId, compte);
  }
  for (const c of comptes.values()) c.acces.sort((a, b) => a.produit.localeCompare(b.produit, "fr"));
  return [...comptes.values()].sort((a, b) => Number(enService(b)) - Number(enService(a))
    || dernierAppel(b) - dernierAppel(a)
    || (a.nom ?? a.email).localeCompare(b.nom ?? b.email, "fr") || a.userId - b.userId);
}

/** L'étape proposée : en service si le Dashboard le dit d'un des accès, sinon en mise en service. */
export function etapeSuggeree(acces: Pick<AccesLibre, "statutCentre">[]): EtapeReprise {
  return acces.some((a) => a.statutCentre === STATUT_EN_SERVICE) ? "EN_PRODUCTION" : "EN_INTEGRATION";
}

/**
 * Les étapes qu'un humain peut déclarer faites avant Pilot, pour ces produits,
 * dans l'ordre de la check-list. Jamais une étape automatique : celles-là, le
 * Dashboard les constate seul (CLAUDE.md).
 */
export function etapesDeclarables(produits: string[]): DefinitionEtape[] {
  return CHECKLIST.filter((e) => e.mode !== "AUTOMATIQUE" && produits.some((p) => (e.produits as string[]).includes(p)));
}

/** Un centre en service a franchi toutes ses étapes : on les propose cochées, l'humain décoche ce qui n'a pas été fait. */
export function etapesParDefaut(etape: EtapeReprise, produits: string[]): CrmCleEtape[] {
  return etape === "EN_PRODUCTION" ? etapesDeclarables(produits).map((e) => e.cle) : [];
}

/**
 * Répartit les étapes déclarées entre les produits repris. Une étape
 * automatique ou sans objet pour ces produits est rendue à part : le service
 * refuse alors toute la reprise, sans rien écrire.
 */
export function repartirEtapes(cles: CrmCleEtape[], produits: string[]) {
  const automatiques: CrmCleEtape[] = [];
  const sansObjet: CrmCleEtape[] = [];
  const parProduit = new Map<string, CrmCleEtape[]>(produits.map((p) => [p, []]));
  for (const cle of new Set(cles)) {
    const definition = CHECKLIST.find((e) => e.cle === cle);
    if (!definition) { sansObjet.push(cle); continue; }
    if (definition.mode === "AUTOMATIQUE") { automatiques.push(cle); continue; }
    const concernes = produits.filter((p) => (definition.produits as string[]).includes(p));
    if (!concernes.length) { sansObjet.push(cle); continue; }
    for (const p of concernes) parProduit.get(p)!.push(cle);
  }
  return { parProduit, automatiques, sansObjet };
}

/** « 2 comptes à relier · 1 contrat à saisir », ou la phrase qui dit que tout est fait. */
export function resumeReprise({ comptes, contrats }: { comptes: number; contrats: number }): string {
  if (!comptes && !contrats) return "Tout est relié.";
  return [comptes && compter(comptes, "compte à relier", "comptes à relier"), contrats && compter(contrats, "contrat à saisir", "contrats à saisir")]
    .filter(Boolean).join(" · ");
}

import type { CrmBaseTarif, CrmReconduction, CrmStatutContrat, CrmStatutEchange, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { eurosPrecis } from "@/pilot/lib/argent";
import { dansJours, debutDuJour } from "@/pilot/lib/dates";
import { LIBELLES_LIGNE, LIBELLES_UNITE } from "@/pilot/lib/propositions/regles";

/**
 * L'écran Ventes (CHOIX.md, C-62) : ce qui a été vendu à un client, dans
 * l'ordre où ça se passe. Formation, interfaçage, essai, début officiel, durée,
 * reconduction, puis les produits et les tarifs. Tout est calculé ici, sans
 * base ni horloge implicite, pour que l'écran et les tests disent la même chose.
 */

export const LIBELLES_RECONDUCTION: Record<CrmReconduction, string> = {
  TACITE: "Tacite", EXPRESSE: "Sur accord écrit", AUCUNE: "Sans reconduction",
};
/** Une phrase par modalité, pour qu'un nouveau venu sache ce qu'elle engage. */
export const AIDES_RECONDUCTION: Record<CrmReconduction, string> = {
  TACITE: "Le contrat repart seul, sauf préavis donné à temps.",
  EXPRESSE: "Le contrat ne repart que si le client le confirme par écrit.",
  AUCUNE: "Le contrat s'arrête à la fin de sa durée.",
};

const JOUR_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Formation et interfaçage : le journal d'abord, la check-list ensuite
// ---------------------------------------------------------------------------

export type EchangeCle = { statut: CrmStatutEchange; surveneuLe: Date };
export type EtatDateCle = "prevue" | "faite" | "a_confirmer" | "aucune";
export type DateCle = { etat: EtatDateCle; le: Date | null; source: "journal" | "checklist" | null };

/**
 * La date d'une réunion clé (formation, interfaçage), lue sans ressaisie :
 * 1. le prochain rendez-vous planifié, aujourd'hui ou plus tard ;
 * 2. sinon la dernière réunion réalisée ;
 * 3. sinon un rendez-vous passé resté planifié : il est à confirmer ;
 * 4. sinon la dernière case cochée de la check-list correspondante ;
 * 5. sinon rien, et l'écran dit comment la planifier.
 * Un rendez-vous annulé ne compte jamais.
 */
export function dateCle(echanges: EchangeCle[], cocheesLe: Date[], maintenant: Date): DateCle {
  const debut = debutDuJour(maintenant);
  const tri = (a: EchangeCle, b: EchangeCle) => +a.surveneuLe - +b.surveneuLe;
  const planifies = echanges.filter((e) => e.statut === "PLANIFIE").sort(tri);
  const aVenir = planifies.find((e) => e.surveneuLe >= debut);
  if (aVenir) return { etat: "prevue", le: aVenir.surveneuLe, source: "journal" };
  const realise = echanges.filter((e) => e.statut === "REALISE").sort(tri).at(-1);
  if (realise) return { etat: "faite", le: realise.surveneuLe, source: "journal" };
  const enSuspens = planifies.at(-1);
  if (enSuspens) return { etat: "a_confirmer", le: enSuspens.surveneuLe, source: "journal" };
  const cochee = [...cocheesLe].sort((a, b) => +a - +b).at(-1);
  if (cochee) return { etat: "faite", le: cochee, source: "checklist" };
  return { etat: "aucune", le: null, source: null };
}

// ---------------------------------------------------------------------------
// Essai
// ---------------------------------------------------------------------------

export type Essai = {
  jours: number | null; debut: Date | null;
  /** Dernier jour d'essai, inclus. */
  fin: Date | null;
  etat: "a_venir" | "en_cours" | "termine" | "incomplet";
  /** Aujourd'hui compris, pendant l'essai seulement. */
  joursRestants: number | null;
};

/** Null quand aucun essai n'est renseigné. Un essai de 30 jours commencé le 3 finit le 2 du mois suivant. */
export function essaiContrat(c: { essaiDebuteLe: Date | null; essaiJours: number | null }, maintenant: Date): Essai | null {
  if (c.essaiDebuteLe === null && c.essaiJours === null) return null;
  const debut = c.essaiDebuteLe ? debutDuJour(c.essaiDebuteLe) : null;
  if (!debut || c.essaiJours === null) return { jours: c.essaiJours, debut, fin: null, etat: "incomplet", joursRestants: null };
  const fin = dansJours(debut, c.essaiJours - 1);
  const jour = debutDuJour(maintenant);
  if (jour < debut) return { jours: c.essaiJours, debut, fin, etat: "a_venir", joursRestants: null };
  if (jour > fin) return { jours: c.essaiJours, debut, fin, etat: "termine", joursRestants: null };
  return { jours: c.essaiJours, debut, fin, etat: "en_cours", joursRestants: Math.round((+fin - +jour) / JOUR_MS) + 1 };
}

/**
 * Le début officiel que l'essai propose (C-87) : le lendemain de son dernier
 * jour, au format de saisie `AAAA-MM-JJ`. Un essai de 30 jours commencé le 3
 * finit le 2 : le contrat débute le 3 du mois suivant. Null si l'essai est
 * incomplet ou sa durée hors bornes. Une proposition, jamais une obligation :
 * l'écran laisse corriger la date.
 */
export function debutApresEssai(essaiDebuteLe: string, essaiJours: number | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(essaiDebuteLe) || essaiJours === null || !Number.isInteger(essaiJours) || essaiJours < 1 || essaiJours > 365) return null;
  const debut = new Date(essaiDebuteLe + "T00:00:00Z");
  if (Number.isNaN(+debut)) return null;
  return new Date(+debut + essaiJours * JOUR_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Produits : ce qui tourne, depuis quand, et ce que ça rapporte par mois
// ---------------------------------------------------------------------------

export type RattachementVente = { productId: number; produit: string; miseEnProductionLe: Date | null; datePromise: Date | null };
export type LigneVente = {
  /** null : ligne hors catalogue (lot S), `produit` porte alors son libellé. */
  productId: number | null; produit: string; centre: string | null; type: CrmTypeLigne;
  montantCentimes: number; unite: CrmUniteVariable | null; volumeInclus: number | null; libelle: string | null;
  /** Geste commercial (lot S) : sur un contrat, la ligne offerte vaut 0 (copiée au net, C-39). */
  offerte?: boolean;
};
export type EtatProduit = "en_service" | "partiel" | "prevu" | "a_planifier" | "sans_centre";
export type ProduitVente = {
  productId: number; nom: string; centres: number; centresEnService: number;
  /** Première mise en service du produit chez ce client. */
  depuisLe: Date | null;
  /** Prochaine date promise d'un centre pas encore en service. */
  prevuLe: Date | null;
  mensuelCentimes: number; etat: EtatProduit;
};

const plusTot = (dates: (Date | null)[]) => dates.filter((d): d is Date => d !== null).sort((a, b) => +a - +b)[0] ?? null;

/**
 * Un produit par ligne : ceux que suivent les centres, et ceux qui ne sont
 * encore que dans le contrat. Les dates d'un produit sont les siennes : un
 * client peut avoir LyraeTalk depuis mars et NoShow depuis septembre.
 */
export function produitsDuClient(rattachements: RattachementVente[], lignes: LigneVente[]): ProduitVente[] {
  const noms = new Map<number, string>();
  for (const r of rattachements) noms.set(r.productId, r.produit);
  for (const l of lignes) if (l.productId !== null && !noms.has(l.productId)) noms.set(l.productId, l.produit);
  return [...noms].map(([productId, nom]) => {
    const suivis = rattachements.filter((r) => r.productId === productId);
    const enService = suivis.filter((r) => r.miseEnProductionLe !== null);
    const mensuelCentimes = lignes.filter((l) => l.productId === productId && l.type === "ABONNEMENT").reduce((t, l) => t + l.montantCentimes, 0);
    const prevuLe = plusTot(suivis.filter((r) => r.miseEnProductionLe === null).map((r) => r.datePromise));
    const etat: EtatProduit = !suivis.length ? "sans_centre"
      : enService.length === suivis.length ? "en_service"
      : enService.length ? "partiel" : prevuLe ? "prevu" : "a_planifier";
    return { productId, nom, centres: suivis.length, centresEnService: enService.length,
      depuisLe: plusTot(enService.map((r) => r.miseEnProductionLe)), prevuLe, mensuelCentimes, etat };
  }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

// ---------------------------------------------------------------------------
// Tarifs
// ---------------------------------------------------------------------------

/**
 * « Part à l'usage » et « 0,35 € par appel traité au-delà de 200 » : une ligne lisible, montant à part.
 * Une installation ou une prestation se facture « une fois ». Une ligne offerte (lot S) se lit
 * « Offert », avec sa périodicité, et sa valeur si elle en garde une.
 */
const UNITE_BASE: Partial<Record<CrmBaseTarif, [string, string]>> = { PAR_SALLE: ["salle", "salles"], PAR_SITE: ["site", "sites"] };

/**
 * Le calcul d'une ligne, en clair (C-90) : « 3 salles × 290,00 € − 10 % ».
 * Null pour une ligne sans quantité ni prix unitaire.
 */
export function detailCalcul(l: { quantite?: number | null; prixUnitaireCentimes?: number | null; baseQuantite?: CrmBaseTarif | null; remisePourMille?: number | null }): string | null {
  if (l.quantite == null || l.prixUnitaireCentimes == null) return null;
  const mots = l.baseQuantite ? UNITE_BASE[l.baseQuantite] : undefined;
  const quantite = mots ? `${l.quantite} ${l.quantite > 1 ? mots[1] : mots[0]}` : String(l.quantite);
  const remise = l.remisePourMille ? ` − ${Math.trunc(l.remisePourMille / 10)}${l.remisePourMille % 10 ? "," + (l.remisePourMille % 10) : ""} %` : "";
  return `${quantite} × ${eurosPrecis(l.prixUnitaireCentimes)}${remise}`;
}

export function decrireTarif(l: Pick<LigneVente, "type" | "montantCentimes" | "unite" | "volumeInclus" | "libelle" | "offerte">
  & { quantite?: number | null; prixUnitaireCentimes?: number | null; baseQuantite?: CrmBaseTarif | null; remisePourMille?: number | null }): { libelle: string; montant: string } {
  const calcul = detailCalcul(l);
  const libelle = l.libelle ?? LIBELLES_LIGNE[l.type];
  const uneFois = l.type === "MISE_EN_SERVICE" || l.type === "PRESTATION";
  const usage = (l.unite ? ` par ${LIBELLES_UNITE[l.unite]}` : "") + (l.volumeInclus != null ? ` au-delà de ${l.volumeInclus.toLocaleString("fr-FR")}` : "");
  if (l.offerte) {
    // Une part à l'usage offerte qui garde un prix dit encore son unité : « Offert (0,35 € par appel traité au-delà de 200) ».
    const valeur = l.montantCentimes > 0 ? ` (${eurosPrecis(l.montantCentimes)}${l.type === "PART_VARIABLE" ? usage : ""})` : "";
    return { libelle, montant: `Offert${valeur}${uneFois ? ", une fois" : l.type === "ABONNEMENT" ? " chaque mois" : ""}${calcul ? ` (${calcul})` : ""}` };
  }
  const montant = eurosPrecis(l.montantCentimes);
  const suite = l.type === "ABONNEMENT" ? " par mois" : uneFois ? ", une fois" : usage;
  return { libelle, montant: montant + suite + (calcul ? ` (${calcul})` : "") };
}

// ---------------------------------------------------------------------------
// Ce qui manque
// ---------------------------------------------------------------------------

export type ContratAControler = {
  statut: CrmStatutContrat; debuteLe: Date | null; engagementMois: number | null;
  reconduction: CrmReconduction | null; lignes: unknown[];
};

/**
 * Ce qu'il faut encore saisir pour qu'un client signé se lise d'un coup d'œil.
 * L'essai n'en fait pas partie : un contrat peut ne pas en prévoir. La
 * formation et l'interfaçage non plus : leur case dit déjà comment les planifier.
 */
export function manquesVente(contrats: ContratAControler[]): string[] {
  if (!contrats.length) return ["le contrat"];
  const manques = new Set<string>();
  for (const c of contrats) {
    if (c.statut === "BROUILLON") manques.add("l'activation du contrat");
    if (!c.debuteLe) manques.add("le début officiel");
    if (c.engagementMois === null) manques.add("la durée");
    if (!c.reconduction) manques.add("la reconduction");
    if (!c.lignes.length) manques.add("les tarifs");
  }
  return [...manques];
}

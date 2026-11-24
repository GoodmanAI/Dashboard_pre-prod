import type { CrmEtapeCommerciale, CrmStatutProposition, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { debutDuJour } from "@/pilot/lib/dates";
import { estClient } from "@/pilot/lib/pipeline";

export const LIBELLES_PROPOSITION: Record<CrmStatutProposition, string> = {
  BROUILLON: "Brouillon", ENVOYEE: "Envoyée", EN_DISCUSSION: "En discussion",
  ACCEPTEE: "Acceptée", REFUSEE: "Refusée", EXPIREE: "Expirée",
};
export const LIBELLES_LIGNE: Record<CrmTypeLigne, string> = {
  MISE_EN_SERVICE: "Frais d'installation", ABONNEMENT: "Abonnement", PART_VARIABLE: "Part à l'usage",
  PRESTATION: "Prestation",
};
/**
 * Les types proposés à la saisie. PRESTATION (lot S) se compte une fois, dans les
 * totaux comme dans le chiffre d'affaires, au même titre que l'installation.
 */
export const TYPES_LIGNE_SAISIS: readonly CrmTypeLigne[] = ["MISE_EN_SERVICE", "ABONNEMENT", "PART_VARIABLE", "PRESTATION"];
export const LIBELLES_UNITE: Record<CrmUniteVariable, string> = {
  APPEL_TRAITE: "appel traité", RDV_PRIS: "rendez-vous pris", SMS_ENVOYE: "SMS envoyé",
};
const TRANSITIONS: Record<CrmStatutProposition, CrmStatutProposition[]> = {
  BROUILLON: ["ENVOYEE"], ENVOYEE: ["EN_DISCUSSION", "ACCEPTEE", "REFUSEE", "EXPIREE"],
  EN_DISCUSSION: ["ACCEPTEE", "REFUSEE", "EXPIREE"], ACCEPTEE: [], REFUSEE: [], EXPIREE: [],
};
export function transitionProposition(de: CrmStatutProposition, vers: CrmStatutProposition): boolean {
  return TRANSITIONS[de].includes(vers);
}

/**
 * La version qui attend la réponse du client, ou null (C-40, C-70, C-71). Une
 * seule règle pour la garde du passage en Signé, celle de la conversion, le
 * bouton « Convertir en client » et le montant affiché. Plusieurs versions
 * peuvent rester ouvertes (envoyer la v2 ne ferme pas la v1) : seule compte la
 * dernière version qui n'est pas un brouillon. Envoyée ou en discussion, c'est
 * elle. Refusée, expirée ou acceptée, la négociation est close, même si une
 * ancienne version est restée envoyée. Un brouillon, le client ne l'a jamais vu.
 */
export function propositionEnAttente<T extends { version: number; statut: CrmStatutProposition }>(versions: readonly T[]): T | null {
  const derniere = versions.filter((v) => v.statut !== "BROUILLON").reduce<T | null>((a, v) => (!a || v.version > a.version ? v : a), null);
  return derniere && (derniere.statut === "ENVOYEE" || derniere.statut === "EN_DISCUSSION") ? derniere : null;
}
/**
 * La version qui en remplace une autre, ou null : la dernière version non
 * brouillon, si elle est plus récente que `p`. Seule la version qui attend une
 * réponse (`propositionEnAttente`) s'accepte, se refuse ou passe en discussion ;
 * une ancienne version restée envoyée est « remplacée par la version N ». Une
 * seule règle pour la garde serveur (`exigerVersionEnAttente`) et l'écran.
 */
export function versionQuiRemplace<T extends { id: number; version: number; statut: CrmStatutProposition }>(versions: readonly T[], p: { id: number; version: number }): T | null {
  const derniere = versions.filter((v) => v.statut !== "BROUILLON").reduce<T | null>((a, v) => (!a || v.version > a.version ? v : a), null);
  return derniere && derniere.id !== p.id && derniere.version > p.version ? derniere : null;
}
export const MESSAGE_VERSION_REMPLACEE_ACCEPTER = "Une version plus récente a remplacé celle-ci. Acceptez la dernière version envoyée.";
export const MESSAGE_VERSION_REMPLACEE_REPONDRE = "Une version plus récente a remplacé celle-ci. Répondez sur la dernière version envoyée.";
/** Division entière, arrondi au plus proche (demi-centime vers le haut). */
export function montantNet(centimes: number, remisePourMille: number): number {
  if (!Number.isSafeInteger(centimes) || centimes < 0 || !Number.isInteger(remisePourMille) || remisePourMille < 0 || remisePourMille > 1000) {
    throw new Error("Montant ou remise invalide.");
  }
  return Number((BigInt(centimes) * BigInt(1000 - remisePourMille) + 500n) / 1000n);
}
/** Le calcul d'une ligne (C-90) : quantité × prix unitaire, et sa remise propre. Tous facultatifs. */
export type CalculLigne = { quantite?: number | null; prixUnitaireCentimes?: number | null; remisePourMille?: number | null };

/**
 * Le brut d'une ligne qui donne sa quantité et son prix unitaire, ou null.
 * C'est le montant d'une ligne de proposition ; le serveur le vérifie.
 */
export function brutCalcule(l: CalculLigne): number | null {
  if (l.quantite == null || l.prixUnitaireCentimes == null) return null;
  const brut = l.quantite * l.prixUnitaireCentimes;
  if (!Number.isSafeInteger(brut)) throw new Error("Montant trop élevé.");
  return brut;
}

/**
 * La remise qui s'applique à une ligne (C-90) : la sienne si elle en a une,
 * sinon celle de la version. Elle remplace, elle ne s'ajoute pas : une ligne à
 * 10 % dans une version à 5 % est remisée de 10 %.
 */
export function remiseEffective(ligne: Pick<CalculLigne, "remisePourMille">, remiseVersion: number): number {
  return ligne.remisePourMille ?? remiseVersion;
}

/**
 * Le net d'une ligne (lot S) : une ligne offerte (geste commercial) vaut 0 et
 * garde son brut à l'affichage ; les autres portent la remise, arrondie par
 * ligne (C-39), la leur ou celle de la version (C-90). Une seule règle pour les
 * totaux et l'acceptation.
 */
export function montantNetLigne(ligne: { montantCentimes: number; offerte?: boolean | null } & Pick<CalculLigne, "remisePourMille">, remisePourMille: number): number {
  const net = montantNet(ligne.montantCentimes, remiseEffective(ligne, remisePourMille));
  return ligne.offerte ? 0 : net;
}

/**
 * Le montant attendu d'une ligne de contrat qui donne sa quantité et son prix
 * (C-90) : le net, remise de la ligne comprise ; 0 si elle est offerte. Null
 * sans quantité ni prix : le montant saisi fait foi.
 */
export function montantContratCalcule(l: CalculLigne & { offerte?: boolean | null }): number | null {
  const brut = brutCalcule(l);
  if (brut === null) return null;
  return l.offerte ? 0 : montantNet(brut, l.remisePourMille ?? 0);
}
/**
 * La ligne de contrat née d'une ligne de proposition acceptée : copiée au net
 * (C-39). Une ligne offerte devient une ligne à 0, offerte, qui garde son
 * libellé. `accepter` (src/lib/propositions/accepter.ts) l'applique.
 */
export function ligneAuNet<T extends { montantCentimes: number; offerte?: boolean | null } & CalculLigne>(ligne: T, remisePourMille: number): T {
  // La ligne de contrat garde la remise qu'elle a reçue (C-90) : « 3 × 290 € − 10 % » se relit sur le contrat.
  const remise = remiseEffective(ligne, remisePourMille);
  return { ...ligne, montantCentimes: montantNetLigne(ligne, remisePourMille), remisePourMille: !ligne.offerte && remise > 0 ? remise : null };
}

export type LigneMontant = { type: CrmTypeLigne; montantCentimes: number; unite?: CrmUniteVariable | null; volumeInclus?: number | null; offerte?: boolean | null; remisePourMille?: number | null };
/** Un total d'une famille de lignes : brut = net + remise + gestes, au centime. */
export type TotalPart = { brutCentimes: number; remiseCentimes: number; gestesCentimes: number; netCentimes: number };
/** Les trois familles d'une proposition : l'abonnement mensuel, ce qui se facture une fois, la part à l'usage. */
export type FamilleLigne = "mensuel" | "uneFois" | "usage";
export const FAMILLE_DU_TYPE: Record<CrmTypeLigne, FamilleLigne> = {
  ABONNEMENT: "mensuel", MISE_EN_SERVICE: "uneFois", PRESTATION: "uneFois", PART_VARIABLE: "usage",
};
const totalVide = (): TotalPart => ({ brutCentimes: 0, remiseCentimes: 0, gestesCentimes: 0, netCentimes: 0 });

/**
 * Les totaux d'une version, calcul pur (C-39, lot S). Chaque ligne est nette
 * (`montantNetLigne`), arrondie seule ; les totaux sont des sommes de lignes.
 * - `abonnementMensuelCentimes`, `miseEnServiceCentimes`, `variables`,
 *   `brutMensuelCentimes` : les montants d'avant le lot S, inchangés pour une
 *   version sans ligne offerte ni prestation.
 * - `prestationCentimes` : le net des prestations, facturées une fois.
 * - `parType` : par famille, le brut, la remise, les gestes (le brut des lignes
 *   offertes) et le net. La part à l'usage additionne des prix unitaires.
 */
export function totauxProposition(lignes: LigneMontant[], remisePourMille: number) {
  let miseEnServiceCentimes = 0, prestationCentimes = 0, abonnementMensuelCentimes = 0;
  const parType: Record<FamilleLigne, TotalPart> = { mensuel: totalVide(), uneFois: totalVide(), usage: totalVide() };
  const variables: Array<{ unite: CrmUniteVariable; prixNetCentimes: number; volumeInclus: number | null; offerte: boolean }> = [];
  for (const ligne of lignes) {
    const net = montantNetLigne(ligne, remisePourMille);
    const part = parType[FAMILLE_DU_TYPE[ligne.type]];
    part.brutCentimes += ligne.montantCentimes; part.netCentimes += net;
    if (ligne.offerte) part.gestesCentimes += ligne.montantCentimes;
    else part.remiseCentimes += ligne.montantCentimes - net;
    if (ligne.type === "MISE_EN_SERVICE") miseEnServiceCentimes += net;
    if (ligne.type === "PRESTATION") prestationCentimes += net;
    if (ligne.type === "ABONNEMENT") abonnementMensuelCentimes += net;
    if (ligne.type === "PART_VARIABLE" && ligne.unite) variables.push({ unite: ligne.unite, prixNetCentimes: net, volumeInclus: ligne.volumeInclus ?? null, offerte: !!ligne.offerte });
  }
  const sommes = [miseEnServiceCentimes, prestationCentimes, abonnementMensuelCentimes,
    ...Object.values(parType).flatMap((p) => [p.brutCentimes, p.remiseCentimes, p.gestesCentimes, p.netCentimes])];
  if (!sommes.every(Number.isSafeInteger)) throw new Error("Total trop élevé.");
  return { miseEnServiceCentimes, prestationCentimes, abonnementMensuelCentimes, variables, brutMensuelCentimes: parType.mensuel.brutCentimes, parType };
}

export { centimesDepuisSaisie } from "@/pilot/lib/argent";
import { entierDepuisSaisie } from "@/pilot/lib/argent";
export function pourMilleDepuisSaisie(saisie: string): number {
  const valeur = entierDepuisSaisie(saisie, 1, "Remise en pourcentage");
  if (valeur > 1000) throw new Error("Vérifiez le champ « Remise en pourcentage ».");
  return valeur;
}

/** À appeler sur la dernière version uniquement. Les jours sont civils UTC. */
export function propositionExpiree(p: { statut: CrmStatutProposition; valideJusquAu: Date | null; repondueLe: Date | null }, etape: CrmEtapeCommerciale, maintenant: Date): boolean {
  return !estClient(etape) && !["PERDU", "EN_SOMMEIL", "ARRETE"].includes(etape)
    && ["ENVOYEE", "EN_DISCUSSION", "EXPIREE"].includes(p.statut) && p.repondueLe === null
    && p.valideJusquAu !== null && joursExpiration(p.valideJusquAu, maintenant) > 3;
}
export function joursExpiration(valideJusquAu: Date, maintenant: Date): number {
  return Math.floor((debutDuJour(maintenant).getTime() - debutDuJour(valideJusquAu).getTime()) / 86400000);
}

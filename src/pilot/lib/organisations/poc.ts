import type { CrmEtapeCommerciale, CrmIssueCyclePoc } from "@prisma/client";
import { transitionPermise } from "@/pilot/lib/pipeline";
import { ajouterMois } from "@/pilot/lib/contrats/regles";
import { debutDuJour, dansJours } from "@/pilot/lib/dates";

export type DatesPoc = { pocDebuteLe?: Date | null; pocProlongeLe?: Date | null };
export const DEBUT_POC_REQUIS = "Indiquez la date de début du POC avant de passer en POC.";
export const POC_DEJA_PROLONGE = "Ce POC a déjà été prolongé d'un mois. Une seule prolongation est possible.";
export const CONTRAT_PENDANT_POC = "Validez d'abord le POC avec « Convertir en client ». Le contrat pourra ensuite être activé.";
export const DEBUT_NOUVEAU_POC_REQUIS = "Ce dossier démarre un nouveau cycle de POC. Indiquez sa date de début. Les dates du POC précédent sont conservées dans l'historique.";
export type EntreeCyclePoc = "NOUVEAU" | "MEME";

/** C-94 : seuls les chemins déjà permis par le parcours peuvent entrer en POC. */
export function entreeCyclePoc(depuis: CrmEtapeCommerciale, vers: CrmEtapeCommerciale,
  avantSortie: CrmEtapeCommerciale | null, cycleOuvert: boolean): EntreeCyclePoc | null {
  if (vers !== "EN_POC" || !transitionPermise(depuis, vers, avantSortie)) return null;
  return cycleOuvert ? "MEME" : "NOUVEAU";
}

/** Perdu et En pause peuvent être repris par C-86 : ils suspendent le même cycle. */
export function issueCloturePoc(cycleOuvert: boolean, vers: CrmEtapeCommerciale): CrmIssueCyclePoc | null {
  if (!cycleOuvert) return null;
  switch (vers) {
    case "SIGNE": return "VALIDE";
    case "POC_NON_TRANSFORME": return "NON_TRANSFORME";
    case "PROPOSITION": return "RETOUR_PROPOSITION";
    case "PROSPECT": return "RETOUR_PROSPECTION";
    default: return null;
  }
}

export function datesNouveauCyclePoc(debut: Date) {
  return { pocDebuteLe: debutDuJour(debut), pocProlongeLe: null };
}

export const LIBELLES_ISSUES_POC: Record<CrmIssueCyclePoc, string> = {
  VALIDE: "validé", NON_TRANSFORME: "non transformé",
  RETOUR_PROPOSITION: "retour au devis", RETOUR_PROSPECTION: "retour à la prospection",
};

export function libellePocPrecedent(p: { debuteLe: Date; prolongeLe: Date | null; issue: CrmIssueCyclePoc }): string {
  const date = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
  const fin = finPrevuePoc({ pocDebuteLe: p.debuteLe, pocProlongeLe: p.prolongeLe })!;
  return `POC précédent : du ${date(p.debuteLe)} au ${date(fin)}, ${LIBELLES_ISSUES_POC[p.issue]}.`;
}

export function refusActivationPendantPoc(etape: CrmEtapeCommerciale): string | null {
  return etape === "EN_POC" ? CONTRAT_PENDANT_POC : null;
}

/** Mois calendaires UTC, jour compris comme l'essai du contrat (C-62). */
export function finPrevuePoc(p: DatesPoc): Date | null {
  return p.pocDebuteLe ? dansJours(ajouterMois(debutDuJour(p.pocDebuteLe), p.pocProlongeLe ? 2 : 1), -1) : null;
}

export function refusDebutPoc(p: DatesPoc, vers: CrmEtapeCommerciale, entree: EntreeCyclePoc | null, debut?: Date): string | null {
  if (debut && (!Number.isFinite(+debut) || vers !== "EN_POC")) return "La date de début se renseigne lors du passage en POC.";
  if (entree === "NOUVEAU") return debut ? null : p.pocDebuteLe ? DEBUT_NOUVEAU_POC_REQUIS : DEBUT_POC_REQUIS;
  if (entree === "MEME" && debut && p.pocDebuteLe && +debutDuJour(debut) !== +debutDuJour(p.pocDebuteLe)) return "La date du POC est déjà enregistrée. Cette reprise continue le même cycle.";
  return entree === "MEME" && !p.pocDebuteLe ? DEBUT_POC_REQUIS : null;
}

export function refusProlongationPoc(p: DatesPoc & { etape: CrmEtapeCommerciale }): string | null {
  if (p.etape !== "EN_POC" || !p.pocDebuteLe) return "Seul un POC en cours avec une date de début peut être prolongé.";
  return p.pocProlongeLe ? POC_DEJA_PROLONGE : null;
}

/** L'alerte reste ouverte après la fin tant que le dossier est en POC. */
export function finPocADecider(p: DatesPoc & { etape: CrmEtapeCommerciale }, maintenant: Date): Date | null {
  const fin = finPrevuePoc(p);
  return p.etape === "EN_POC" && fin && debutDuJour(maintenant) >= dansJours(fin, -7) ? fin : null;
}

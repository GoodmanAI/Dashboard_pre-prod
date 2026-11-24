import type { CrmStatutContrat } from "@prisma/client";
import { dansJours, debutDuJour } from "@/pilot/lib/dates";
import { compter } from "@/pilot/lib/texte";

export const LIBELLES_CONTRAT: Record<CrmStatutContrat, string> = {
  BROUILLON: "Brouillon", ACTIF: "Actif", TERMINE: "Terminé",
};

/** Mois calendaires UTC, sans débordement du dernier jour du mois. */
export function ajouterMois(date: Date, n: number): Date {
  const resultat = new Date(date);
  const jour = resultat.getUTCDate();
  resultat.setUTCDate(1);
  resultat.setUTCMonth(resultat.getUTCMonth() + n);
  const dernier = new Date(resultat);
  dernier.setUTCMonth(dernier.getUTCMonth() + 1, 0);
  resultat.setUTCDate(Math.min(jour, dernier.getUTCDate()));
  return resultat;
}

type ConditionsContrat = {
  signeLe: Date | null; debuteLe: Date | null; engagementMois: number | null;
  preavisMois: number | null; renouvelleLe: Date | null;
};
/** L'horloge est explicite pour partager le même calcul avec les alertes et les tests. */
export function echeancesContrat(c: ConditionsContrat, maintenant: Date) {
  const origine = c.debuteLe ?? c.signeLe;
  const finEngagement = origine && c.engagementMois !== null ? ajouterMois(origine, c.engagementMois) : null;
  const limitePreavis = finEngagement && c.preavisMois !== null ? ajouterMois(finEngagement, -c.preavisMois) : null;
  const echeances = [c.renouvelleLe, finEngagement].filter((d): d is Date => d !== null && d >= debutDuJour(maintenant));
  const prochaineEcheance = echeances.sort((a, b) => +a - +b)[0] ?? null;
  return { finEngagement, limitePreavis, prochaineEcheance };
}

const dateCourte = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
/** Termine une phrase par un point, sans doubler celui d'une date abrégée (« 24 oct. »). */
const phrase = (texte: string) => (texte.endsWith(".") ? texte : `${texte}.`);

/**
 * La règle de l'alerte `renouvellement-` (C-43), partagée par les alertes et le
 * Parc pour qu'ils ne divergent jamais. Elle s'ouvre 90 jours avant l'échéance,
 * ou avant la limite du préavis quand elle tombe plus tôt : c'est là que la
 * décision se prend. `dateFait` est la date qui ordonne (la limite du préavis
 * quand elle compte), `echeance` la fin d'engagement ou le renouvellement.
 */
export function renouvellementContrat(c: ConditionsContrat & { statut: CrmStatutContrat }, maintenant: Date):
  { dateFait: Date; echeance: Date; detail: string } | null {
  if (c.statut !== "ACTIF") return null;
  const { finEngagement, limitePreavis, prochaineEcheance } = echeancesContrat(c, maintenant);
  const debut = debutDuJour(maintenant);
  const horizon = dansJours(maintenant, 91);
  const finAVenir = finEngagement && finEngagement >= debut ? finEngagement : null;
  const parPreavis = !!(finAVenir && limitePreavis && limitePreavis < horizon);
  const parEcheance = !!(prochaineEcheance && prochaineEcheance < horizon);
  if (!parPreavis && !parEcheance) return null;
  const surFin = !!finAVenir && (parPreavis || +prochaineEcheance! === +finAVenir);
  let detail = phrase(`Renouvellement prévu le ${dateCourte(prochaineEcheance!)}`);
  if (surFin) {
    detail = phrase(`Fin d'engagement le ${dateCourte(finAVenir!)}`);
    if (limitePreavis) detail += " " + (limitePreavis < debut
      ? phrase(`Préavis dépassé depuis le ${dateCourte(limitePreavis)}`)
      : phrase(`Préavis de ${compter(c.preavisMois!, "mois", "mois")} : décider avant le ${dateCourte(limitePreavis)}`));
  }
  return { dateFait: surFin ? limitePreavis ?? finAVenir! : prochaineEcheance!, echeance: surFin ? finAVenir! : prochaineEcheance!, detail };
}

export function transitionContrat(de: CrmStatutContrat, vers: CrmStatutContrat): boolean {
  return de === "BROUILLON" && vers === "ACTIF" || de === "ACTIF" && vers === "TERMINE";
}

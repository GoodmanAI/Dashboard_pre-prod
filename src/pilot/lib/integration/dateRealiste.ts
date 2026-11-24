import type { CrmCleEtape, CrmTiers } from "@prisma/client";
import { CHECKLIST, definitionEtape } from "@/pilot/lib/checklist/definition";
import { dansJours, debutDuJour } from "@/pilot/lib/dates";

const JOUR = 86400000;
/** Les tiers hors de Lyrae et du client : leur délai ne se négocie pas, sept jours au moins. */
export const TIERS_EXTERNES: readonly CrmTiers[] = ["EDL", "OPERATEUR_TELEPHONIE", "PRESTATAIRE_SITE_WEB"];

export type EtapeDateRealiste = {
  cle: CrmCleEtape; faite: boolean; creeLe: Date; echeanceLe: Date | null; enAttenteDe: CrmTiers | null;
};

/** Jours civils UTC entre deux instants, signés : minuit fait changer de jour. */
export function joursEntre(de: Date, a: Date): number {
  return Math.round((debutDuJour(a).getTime() - debutDuJour(de).getTime()) / JOUR);
}

/**
 * Architecture §8.3. Les étapes bloquantes ouvertes avancent en parallèle :
 * la plus longue fixe la date, puis le passage en production s'ajoute s'il
 * n'est pas coché. Une étape absente de la liste est une étape ouverte.
 * À égalité, l'étape critique est la première dans l'ordre du référentiel.
 */
export function dateRealiste({ etapes, maintenant }: { etapes: EtapeDateRealiste[]; maintenant: Date }): {
  date: Date; resteJours: number; etapeCritique: CrmCleEtape | null;
} {
  const ordre = (cle: CrmCleEtape) => CHECKLIST.findIndex((d) => d.cle === cle);
  let max = 0;
  let etapeCritique: CrmCleEtape | null = null;
  for (const e of [...etapes].sort((a, b) => ordre(a.cle) - ordre(b.cle))) {
    const def = definitionEtape(e.cle);
    if (e.faite || !def.bloquante) continue;
    let reste = Math.max(1, def.dureeAttendueJours - joursEntre(e.creeLe, maintenant));
    if (e.echeanceLe) reste = Math.max(reste, joursEntre(maintenant, e.echeanceLe));
    else if (e.enAttenteDe && TIERS_EXTERNES.includes(e.enAttenteDe)) reste = Math.max(reste, 7);
    if (reste > max) { max = reste; etapeCritique = e.cle; }
  }
  const passageFait = etapes.some((e) => e.cle === "PASSAGE_PRODUCTION" && e.faite);
  if (!passageFait) {
    max += definitionEtape("PASSAGE_PRODUCTION").dureeAttendueJours;
    etapeCritique ??= "PASSAGE_PRODUCTION";
  }
  if (max === 0) return { date: maintenant, resteJours: 0, etapeCritique: null };
  return { date: dansJours(maintenant, max), resteJours: max, etapeCritique };
}

/** Écart en jours civils UTC entre la date réaliste et la date promise : positif, en retard. */
export function ecartJours(realiste: Date, promise: Date): number;
export function ecartJours(realiste: Date, promise: Date | null): number | null;
export function ecartJours(realiste: Date, promise: Date | null): number | null {
  return promise ? joursEntre(promise, realiste) : null;
}

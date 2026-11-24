import { decalerMois } from "@/pilot/lib/ca/projeter";
import { cleCa } from "@/pilot/lib/ca/reel";

type FormationNonComptabilisee = { debuteLe: Date; montantCentimes: number | null; comptabiliseeLe: Date | null };
export type FormationPourRattrapage = FormationNonComptabilisee & { organisationId: number; cleExiste: boolean };

/** Un prix connu d'un mois terminé, sans clé comptable : prochain arrêté mensuel. */
export function formationARattraper(f: FormationNonComptabilisee, cleExiste: boolean, maintenant: Date): boolean {
  return !cleExiste && f.montantCentimes !== null && f.comptabiliseeLe === null && decalerMois(f.debuteLe, 1) <= maintenant;
}

/** Sélection pure, commune à l'affichage du calendrier et au rattrapage du cron. */
export function selectionnerFormationsARattraper(formations: FormationPourRattrapage[], maintenant: Date) {
  return formations.filter((f) => formationARattraper(f, f.cleExiste, maintenant)).map((f) => ({
    organisationId: f.organisationId, mois: decalerMois(f.debuteLe, 0),
    cle: cleCa(f.debuteLe, f.organisationId, null, null), montantCentimes: f.montantCentimes!,
  })).sort((a, b) => +a.mois - +b.mois || a.organisationId - b.organisationId);
}

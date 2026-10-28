/**
 * Statut de suivi d'une carte « Ordonnances manquantes » ou « Questionnaires »
 * (tache Vega 35f049, 28/10/2026, table "SuiviCarte"). Une secretaire signale
 * aux autres qu'un cas est en cours sans classer la carte.
 *
 * Valeurs stockees en base (CHECK de la migration 2026_10_28_suivi_cartes.sql) :
 * on en ajoute, on n'en renomme jamais.
 *
 * Partage entre l'ecran et la route : aucun import serveur ici.
 */

export const STATUTS_SUIVI = ["contacte", "injoignable"] as const;

export type StatutSuivi = (typeof STATUTS_SUIVI)[number];

export const LIBELLES_SUIVI: Record<StatutSuivi, string> = {
  contacte: "Contacté, en attente des documents",
  injoignable: "Injoignable",
};

export const NOTE_SUIVI_MAX = 200;

export type SuiviCarte = {
  statut: StatutSuivi;
  note: string | null;
  parNom: string | null;
  majAt: string;
};

export function estStatutSuivi(v: unknown): v is StatutSuivi {
  return typeof v === "string" && (STATUTS_SUIVI as readonly string[]).includes(v);
}

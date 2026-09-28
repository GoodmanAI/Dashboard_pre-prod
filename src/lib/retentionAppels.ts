/**
 * Rétention des appels : un délai par centre (`UserProduct.retentionAppelsMois`),
 * passé lequel la transcription et la donnée patient d'un appel sont effacées.
 *
 * Plan `plans/2026-09-retention-des-appels.md` (workspace). Deux mécanismes, qui se
 * doublent volontairement :
 *   - la LECTURE : la liste des appels, les incidents et le détail d'un appel ne
 *     rendent rien d'antérieur à `debutConservation`, même si le job n'est pas passé ;
 *   - le JOB de nuit (`scripts/db-maintenance/anonymise_appels.sh`) efface
 *     réellement. Ses bornes et son calcul de date doivent rester ceux d'ici.
 *
 * Les statistiques ne sont pas bornées : elles ne lisent que `stats`, qui reste.
 */

export const RETENTION_MIN_MOIS = 1;
export const RETENTION_MAX_MOIS = 24;
export const RETENTION_DEFAUT_MOIS = 3;

/**
 * Le plus ancien instant encore conservé : maintenant moins `mois` mois, en UTC.
 *
 * Même calcul que le job (`now() AT TIME ZONE 'UTC' - make_interval(months => N)`) :
 * PostgreSQL et JavaScript reculent tous deux d'un mois calendaire en gardant le
 * jour, et ramènent au dernier jour du mois quand il n'existe pas (31 → 30).
 */
export function debutConservation(mois: number, maintenant: Date = new Date()): Date {
  const d = new Date(maintenant.getTime());
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - mois);
  const dernierDuMois = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernierDuMois));
  return d;
}

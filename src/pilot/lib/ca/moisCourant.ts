import { chargerEntreesReel } from "./entreesReel";
import { decalerMois } from "./projeter";
import { reelDuMois, type LigneReel } from "./reel";

/** Jour du mois UTC, jour en cours compris, et longueur du mois. */
export function joursDuMoisCourant(maintenant: Date): { jour: number; joursDuMois: number } {
  const joursDuMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 0)).getUTCDate();
  return { jour: Math.max(1, maintenant.getUTCDate()), joursDuMois };
}
/** `round(quantite × joursDuMois / joursEcoules)` en entiers, demis vers le haut. S'applique au volume (§8.9). */
export function projeterFinDeMois(quantite: number, jour: number, joursDuMois: number): number {
  const ecoules = BigInt(Math.max(1, jour));
  return Number((BigInt(quantite) * BigInt(joursDuMois) * 2n + ecoules) / (2n * ecoules));
}
/**
 * Pur : le réel du mois en cours, résumé pour le haut de l'écran. `lignesProjetees`
 * est le même calcul avec le volume porté à fin de mois : le volume inclus se
 * retire du volume projeté, pas d'un montant multiplié.
 */
export function resumerMoisCourant(p: { lignes: LigneReel[]; lignesProjetees: LigneReel[]; motifs: string[]; maintenant: Date }) {
  const { jour, joursDuMois } = joursDuMoisCourant(p.maintenant);
  let recurrent = 0, miseEnService = 0, variableAuJour = 0, variableProjetee = 0;
  for (const l of p.lignes) {
    recurrent += l.recurrentCentimes; miseEnService += l.miseEnServiceCentimes;
    variableAuJour += l.variableCentimes;
  }
  for (const l of p.lignesProjetees) variableProjetee += l.variableCentimes;
  return { mois: decalerMois(p.maintenant, 0).toISOString(), recurrent, miseEnService, variableAuJour, variableProjetee, jour, joursDuMois, motifs: p.motifs };
}
export type MoisCourant = ReturnType<typeof resumerMoisCourant>;

/** Le mois en cours au jour près, compteurs du 1er à maintenant. Jamais écrit. */
export async function moisCourant(maintenant: Date): Promise<MoisCourant> {
  const entrees = await chargerEntreesReel({ mois: maintenant, finCompteurs: maintenant });
  const { jour, joursDuMois } = joursDuMoisCourant(maintenant);
  const auJour = reelDuMois(entrees);
  const projete = reelDuMois({ ...entrees, volumeProjete: (v) => projeterFinDeMois(v, jour, joursDuMois) });
  return resumerMoisCourant({ lignes: auJour.lignes, lignesProjetees: projete.lignes, motifs: auJour.motifs, maintenant });
}

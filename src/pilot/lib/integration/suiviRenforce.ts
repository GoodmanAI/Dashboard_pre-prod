const HEURE = 3600000;
export const DUREE_SUIVI_RENFORCE_JOURS = 14;
export const SEUIL_SILENCE_RENFORCE_HEURES = 24;
/** Hors suivi renforcé, l'alerte `silence-` sonne à 48 h ; le feu Silence du Parc vire au rouge au même seuil. */
export const SEUIL_SILENCE_HEURES = 48;

/** Posé au cochage du passage en production : quatorze jours à l'instant près. */
export function periodeSuiviRenforce(maintenant: Date) {
  return {
    miseEnProductionLe: maintenant,
    suiviRenforceJusquAu: new Date(maintenant.getTime() + DUREE_SUIVI_RENFORCE_JOURS * 24 * HEURE),
  };
}

export function enSuiviRenforce(suiviRenforceJusquAu: Date | null | undefined, maintenant: Date): boolean {
  return !!suiviRenforceJusquAu && maintenant < suiviRenforceJusquAu;
}

/**
 * Architecture §8.7. Pendant le suivi renforcé, 24 h sans appel s'alertent. La
 * référence est le plus récent de la mise en production et du dernier appel :
 * un centre mis en production il y a 3 h sans appel n'est pas encore silencieux.
 * `heures` est nul hors de la période.
 */
export function silenceRenforce({ miseEnProductionLe, suiviRenforceJusquAu, dernierAppelLe, maintenant }: {
  miseEnProductionLe: Date | null; suiviRenforceJusquAu: Date | null; dernierAppelLe: Date | null; maintenant: Date;
}): { actif: boolean; heures: number | null; depuisMiseEnProduction: boolean } {
  if (!miseEnProductionLe || !enSuiviRenforce(suiviRenforceJusquAu, maintenant)) {
    return { actif: false, heures: null, depuisMiseEnProduction: false };
  }
  const depuisMiseEnProduction = !dernierAppelLe || dernierAppelLe < miseEnProductionLe;
  const reference = depuisMiseEnProduction ? miseEnProductionLe : dernierAppelLe!;
  const heures = Math.max(0, Math.floor((maintenant.getTime() - reference.getTime()) / HEURE));
  return { actif: heures >= SEUIL_SILENCE_RENFORCE_HEURES, heures, depuisMiseEnProduction };
}

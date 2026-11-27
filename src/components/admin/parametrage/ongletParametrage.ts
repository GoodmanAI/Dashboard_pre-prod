/**
 * Ce qu'un onglet de « Paramétrage d'un centre » reçoit de la page (27/11/2026, plan
 * lyrae/plans/2026-11-separation-dashboard-pilot.md) : le centre à ouvrir d'abord, et de
 * quoi dire à la page quel centre est choisi, pour que l'onglet suivant l'ouvre aussi.
 * Ouvert seul (aperçus), un onglet n'en a pas besoin.
 */
export type OngletParametrage = {
  /** `UserProduct.id` à ouvrir, s'il est dans la liste de l'onglet. */
  centreInitial?: number;
  onCentre?: (userProductId: number) => void;
};

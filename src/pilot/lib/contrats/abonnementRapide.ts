/**
 * La saisie rapide de l'abonnement d'un client (fiche, 25/11/2026). Un contrat compte
 * au mois : un montant annuel devient son douzième, arrondi au centime.
 */
export type Periodicite = "MOIS" | "AN";

export function mensuelDepuisSaisie(centimes: number, periodicite: Periodicite): number {
  return periodicite === "AN" ? Math.round(centimes / 12) : centimes;
}

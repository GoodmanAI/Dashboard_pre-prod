/** Les champs date des formulaires sont des jours ISO, affichés en UTC dans Pilot. */
export function debutDuJour(maintenant: Date): Date {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
}
export function dansJours(maintenant: Date, jours: number): Date {
  const date = debutDuJour(maintenant);
  date.setUTCDate(date.getUTCDate() + jours);
  return date;
}

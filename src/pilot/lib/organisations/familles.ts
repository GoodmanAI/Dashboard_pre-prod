/**
 * Familles de RIS et d'outils de prise de RDV en ligne (C-66). Les champs `ris` et
 * `outilRdv` sont en saisie libre (C-59) : « Xplore », « Xplore (EDL) » et
 * « EDL Explore » désignent le même éditeur. Pour classer et filtrer les
 * clients, on les ramène à une famille. La valeur saisie, elle, ne change pas.
 */

const RIS: [RegExp, string][] = [
  [/plusieurs|\b\d ris\b/i, "Plusieurs RIS"],
  [/xplore|explore|\bedl\b/i, "Xplore (EDL)"],
  [/softway|one ?manager|v[ée]nus/i, "Softway"],
  [/e?novacom/i, "Enovacom"],
  [/therasoft|terrasoft|tsx/i, "Therasoft"],
  [/evolucare/i, "Evolucare"],
  [/intuitim/i, "Intuitim"],
  [/sillage|numih/i, "Sillage (Numih)"],
  [/dedalus|dxplanning|dx ?image/i, "Dedalus"],
  [/\brosa\b/i, "Rosa"],
];

// L'ordre ne compte pas : c'est l'outil cité en premier dans la saisie qui l'emporte.
const RDV: [RegExp, string][] = [
  [/doctolib/i, "Doctolib"],
  [/xplore|explore|\bedl\b/i, "Xplore Rendez-vous (EDL)"],
  [/easy ?doc/i, "EasyDoct"],
  [/maiia/i, "Maiia"],
  [/keldoc/i, "Keldoc"],
  [/clicodoc/i, "ClicoDoc"],
  [/tsxcare/i, "TsXcare (Therasoft)"],
  [/e-rdv/i, "E-RDV (Enovacom)"],
  [/web ?booking/i, "WebBooking (Medasys)"],
  [/radio[- ]?booking/i, "Radio-Booking"],
  [/\brosa\b/i, "Rosa"],
  [/formulaire/i, "Formulaire du site"],
  [/secr[ée]tariat externalis|centre d'appels|plateforme externe/i, "Secrétariat externalisé"],
  [/t[ée]l[ée]phone/i, "Téléphone seul"],
];

/** Retire la réserve « (à confirmer) » ou « (selon …) » d'une valeur inconnue des listes. */
function sansReserve(valeur: string): string {
  return valeur.replace(/\s*\([^()]*(à confirmer|selon)[^()]*\)\s*$/i, "").trim();
}

export function familleRis(ris: string | null | undefined): string | null {
  const v = ris?.trim();
  if (!v) return null;
  return RIS.find(([motif]) => motif.test(v))?.[1] ?? sansReserve(v);
}

/** L'outil de RDV en ligne, ou « Téléphone seul » quand il n'y en a pas. */
export function familleRdv(outil: string | null | undefined): string | null {
  const v = outil?.trim();
  if (!v) return null;
  const premier = RDV.map(([motif, nom]) => ({ nom, position: v.search(motif) }))
    .filter((t) => t.position >= 0)
    .sort((a, b) => a.position - b.position)[0];
  return premier?.nom ?? sansReserve(v);
}

/** Les familles présentes, de la plus fréquente à la plus rare ; les inconnus en dernier. */
export function repartition(valeurs: (string | null)[]): { famille: string | null; nombre: number }[] {
  const comptes = new Map<string | null, number>();
  for (const v of valeurs) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  return [...comptes].map(([famille, nombre]) => ({ famille, nombre }))
    .sort((a, b) => (a.famille === null ? 1 : 0) - (b.famille === null ? 1 : 0) || b.nombre - a.nombre || (a.famille ?? "").localeCompare(b.famille ?? "", "fr"));
}

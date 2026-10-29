/**
 * Comparaison de texte des champs « Rechercher » des écrans que la barre préfiltre.
 *
 * La barre rend un examen sans accents (« scanner injecte », « echographie abdominale ») :
 * comparé tel quel à « Scanner injecté », il ne trouvait rien. On compare donc sans accents
 * ni casse, et mot à mot : chaque mot de la requête doit apparaître, dans n'importe quel
 * ordre (« doppler membres » trouve « Écho-doppler veineux des membres inférieurs »).
 */
export function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function contientTousLesMots(texte: string, requete: string): boolean {
  const t = sansAccents(texte);
  return sansAccents(requete)
    .split(/\s+/)
    .filter(Boolean)
    .every((mot) => t.includes(mot));
}

const LIAISONS = new Set(["de", "des", "du", "d", "la", "le", "les", "l", "a", "au", "aux"]);

/**
 * Ce qui précise l'examen après sa modalité, pour le champ « Rechercher » d'un écran
 * déjà filtré par type : « mammographie de depistage » donne « depistage ».
 * Vide quand la phrase ne disait que la modalité.
 */
export function precisionExamen(examen: string | undefined): string {
  if (!examen) return "";
  return examen
    .split(/\s+/)
    .slice(1)
    .filter((m) => !LIAISONS.has(m))
    .join(" ");
}

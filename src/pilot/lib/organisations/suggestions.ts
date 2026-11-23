/**
 * Suggestions des champs RIS et outil de RDV (C-69 ; C-59, C-66). Les champs restent en
 * saisie libre : on propose la liste du code, puis ce qui a déjà été saisi,
 * dédoublonné par famille pour ne pas proposer trois écritures du même éditeur.
 */
import { EDITEURS_RIS, METIERS_CONTACT, OUTILS_RDV } from "./referentielClient";
import { familleRdv, familleRis } from "./familles";

/** `metier` : le métier des contacts (C-88), même principe que le RIS. */
export type SuggestionsSaisie = { ris: string[]; outilRdv: string[]; metier: string[] };
/** Une valeur saisie, éventuellement avec le nombre de fois où elle l'a été. */
export type Saisie = string | { valeur: string | null; nombre: number };

/** Les suggestions du code seul, quand la page n'a rien lu en base. */
export const SUGGESTIONS_DU_CODE: SuggestionsSaisie = { ris: [...EDITEURS_RIS], outilRdv: [...OUTILS_RDV], metier: [...METIERS_CONTACT] };

const nettoyer = (v: string) => v.replace(/\s+/g, " ").trim();
const cle = (v: string) => nettoyer(v).toLowerCase();
const sansAccents = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");
const comparer = (a: string, b: string) => sansAccents(a).localeCompare(sansAccents(b), "fr") || a.localeCompare(b, "fr");

/**
 * La liste du code d'abord, puis les valeurs apprises par ordre alphabétique sans
 * accents. Une valeur apprise dont la famille est déjà dans le code n'ajoute rien ;
 * deux écritures d'une même famille hors du code donnent la plus fréquente (la
 * première par ordre alphabétique à égalité). Les valeurs vides sont écartées.
 */
export function fusionnerSuggestions(
  code: readonly string[], saisies: readonly Saisie[], famille: (valeur: string) => string | null,
): string[] {
  const fam = (v: string) => famille(v) ?? v;
  const dejaVus = new Set<string>();
  const resultat: string[] = [];
  for (const v of code) {
    const propre = nettoyer(v);
    if (!propre || dejaVus.has(cle(propre))) continue;
    dejaVus.add(cle(propre));
    resultat.push(propre);
  }
  const famillesDuCode = new Set(resultat.map((v) => cle(fam(v))));

  // Écritures distinctes (casse et espaces ramenés), avec leur fréquence.
  const ecritures = new Map<string, { nombre: number; variantes: Map<string, number> }>();
  for (const s of saisies) {
    const valeur = typeof s === "string" ? s : s.valeur;
    const nombre = typeof s === "string" ? 1 : s.nombre;
    if (valeur == null || nombre <= 0) continue;
    const propre = nettoyer(valeur);
    if (!propre) continue;
    const e = ecritures.get(cle(propre)) ?? { nombre: 0, variantes: new Map() };
    e.nombre += nombre;
    e.variantes.set(propre, (e.variantes.get(propre) ?? 0) + nombre);
    ecritures.set(cle(propre), e);
  }

  const parFamille = new Map<string, { texte: string; nombre: number }[]>();
  for (const [k, e] of ecritures) {
    if (dejaVus.has(k)) continue;
    const texte = [...e.variantes].sort((a, b) => b[1] - a[1] || comparer(a[0], b[0]))[0][0];
    const f = cle(fam(texte));
    if (famillesDuCode.has(f)) continue;
    parFamille.set(f, [...(parFamille.get(f) ?? []), { texte, nombre: e.nombre }]);
  }
  const apprises = [...parFamille.values()].map((membres) =>
    membres.sort((a, b) => b.nombre - a.nombre || comparer(a.texte, b.texte))[0].texte);
  return [...resultat, ...apprises.sort(comparer)];
}

export const suggestionsRis = (saisies: readonly Saisie[], code: readonly string[] = EDITEURS_RIS) => fusionnerSuggestions(code, saisies, familleRis);
export const suggestionsRdv = (saisies: readonly Saisie[], code: readonly string[] = OUTILS_RDV) => fusionnerSuggestions(code, saisies, familleRdv);
/** Un métier n'a pas de famille : deux écritures qui ne diffèrent que par la casse ou les espaces n'en font qu'une. */
export const suggestionsMetier = (saisies: readonly Saisie[], code: readonly string[] = METIERS_CONTACT) => fusionnerSuggestions(code, saisies, () => null);

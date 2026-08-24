/**
 * Accent du produit, pour les contextes qui ne peuvent PAS resoudre `var()`.
 *
 * La source de verite du style est `src/app/global.css` (variables `--accent*`).
 * Tout ce qui est du CSS — `sx`, `style`, feuilles — doit utiliser
 * `var(--accent)` et surtout PAS ces constantes : sinon la couleur ne suivrait
 * pas le produit affiche.
 *
 * Ces constantes n'existent que pour les trois cas ou `var()` echoue :
 *
 *   1. les attributs de presentation SVG poses par Recharts (`fill=`, `stroke=`)
 *      — `var()` n'est pas resolu dans un attribut XML, seulement dans une
 *      propriete CSS ;
 *   2. les props de composants qui recoivent une couleur comme donnee
 *      (`themeSecondaryColor`) et la reinjectent ailleurs ;
 *   3. les valeurs JS servant de repli dans un calcul (`colors[k] ?? ACCENT`).
 *
 * LIMITE ASSUMEE : ces valeurs sont FIGEES a la compilation. Un composant qui
 * les utilise gardera la couleur LyraeTalk meme sous LyraeKonnect. C'est
 * acceptable tant que ca ne concerne que des graphiques ; le jour ou un de ces
 * points doit suivre le produit, il faudra lire la variable CSS au runtime
 * (`getComputedStyle(document.documentElement).getPropertyValue("--accent")`)
 * plutot qu'importer cette constante.
 */

/** Accent principal. Equivalent de `var(--accent)`. */
export const ACCENT = "#48C8AF";

/** Etat presse / survol. Equivalent de `var(--accent-press)`. */
export const ACCENT_PRESS = "#3AB19B";

/** Declinaison foncee, employee pour le texte sur fond clair. `var(--accent-deep)`. */
export const ACCENT_DEEP = "#2A6F64";

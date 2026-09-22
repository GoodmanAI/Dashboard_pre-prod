/**
 * Les couleurs du Dashboard, en un seul endroit.
 *
 * Avant le 22/09/2026, chaque écran redéclarait les siennes : `BORDER` dans 25 fichiers,
 * `INK` dans 20, et quatre nuanciers cohabitaient (INK / TEXT_MAIN / le thème du gabarit /
 * des gris Tailwind). Trois teintes de `DANGER`, cinq teintes de survol pour l'accent.
 *
 * L'accent vient des variables CSS de `global.css` (`--accent`, `--accent-press`,
 * `--accent-deep`, `--accent-rgb`), parce qu'il change avec le produit (`data-produit`).
 * Le reste est fixe. Le thème MUI (`utils/theme/DefaultColors.tsx`) porte les mêmes
 * valeurs pour les contrôles : ici, c'est pour les `sx`.
 *
 * Les pages patient (`/c`, `/d`, `/confirm`) rendent hors thème et gardent leur nuancier.
 */

/** Texte principal. */
export const INK = "#0F2A3F";
/** Texte secondaire, libellés, aides. */
export const INK_MUTED = "#5A6B7B";
/** Contour des cartes, des tableaux, des champs. */
export const BORDER = "#E4EAEE";
/** Fond d'une carte. */
export const SURFACE = "#FFFFFF";
/** Fond atténué : en-tête de tableau, zone de dépôt, ligne paire. */
export const SURFACE_MUTED = "#F7FAFB";
/** Survol d'une ligne ou d'une carte cliquable. */
export const SURFACE_HOVER = "#F5FBFA";

/** L'accent du produit. Ne jamais l'écrire en hexadécimal : il change sous Konnect. */
export const BRAND = "var(--accent)";
export const BRAND_DARK = "var(--accent-press)";
export const BRAND_DEEP = "var(--accent-deep)";
/** Fond teinté à l'accent (pastille, badge, zone active). */
export const BRAND_SOFT = "rgba(var(--accent-rgb), 0.15)";

/** Ce qui ne se rattrape pas, et les erreurs. Même valeur que `palette.error` du thème. */
export const DANGER = "#B3261E";
export const DANGER_SOFT = "#FBECEB";
/** Ce qui est fait, validé, en service. */
export const OK = "#186A3B";
export const OK_SOFT = "#E6F4EA";
/** Ce qui demande un regard. */
export const WARNING = "#B4602A";
export const WARNING_SOFT = "#FBF2E0";

/** Rayon des cartes et des champs, en unités MUI (2 = 16 px). */
export const RAYON = 2;
/** Ombre réservée à ce qui flotte : barre d'enregistrement, retour, menu. */
export const OMBRE_FLOTTANTE = "0 10px 30px rgba(15, 42, 63, 0.10)";

/** Anciens noms, pour les écrans qui les gardent le temps de la transition. */
export const TEXT_MAIN = INK;
export const TEXT_MUTED = INK_MUTED;
export const BRAND_TEAL = BRAND;
export const BRAND_TEAL_DARK = BRAND_DARK;
export const BRAND_TEAL_SOFT = BRAND_SOFT;
export const CARD_BG = SURFACE;
export const PAGE_BG = SURFACE_MUTED;
export const NEUTRAL_BG = SURFACE_MUTED;
export const MANQUE = DANGER;
export const PERDU = WARNING;

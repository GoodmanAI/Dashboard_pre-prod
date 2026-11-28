/**
 * Les couleurs de Pilot : les écrans n'écrivent jamais de code hexadécimal. Hors
 * de `theme.ts` : ce module client serait illisible depuis une page serveur.
 *
 * Palette inspirée des couleurs système d'Apple (CHOIX.md, C-53) : gris
 * neutres, un bleu d'accent, des teintes d'état douces.
 */
export const JETONS = {
  encre: "#1D1D1F",
  encreSurvol: "#3A3A3C",
  secondaire: "#6E6E73",
  tertiaire: "#AEAEB2",
  accent: "#0071E3",
  accentFonce: "#0058B0",
  accentFond: "#E8F1FC",
  accentAnneau: "rgba(0, 113, 227, 0.28)",
  filet: "#E5E5EA",
  filetInterne: "#EFEFF4",
  filetChamp: "#D2D2D7",
  filetSurvol: "#C7C7CC",
  surface: "#F5F5F7",
  gris: "#F2F2F7",
  segment: "#E8E8ED",
  survolPage: "#EBEBF0",
  rail: "#E5E5EA",
  pastille: "#3A3A3C",
  cercle: "#C7C7CC",
  bloqueFilet: "#FFC9C4",
  regressionFond: "#FFF5F4",
  regressionFilet: "#FFD5D0",
  /** Barres translucides : fond semi-opaque, flouté derrière. */
  verre: "rgba(255, 255, 255, 0.72)",
  verreMenu: "rgba(246, 246, 248, 0.78)",
  filetVerre: "rgba(0, 0, 0, 0.08)",
  ombreLogo: "0 1px 2px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
  /** L'icône de l'application, dans la barre latérale. */
  logo: "linear-gradient(180deg, #3D8BFF 0%, #0062D6 100%)",
  /** Ombres : douces au repos, plus marquées au survol et pour ce qui flotte. */
  ombre: "0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 12px rgba(0, 0, 0, 0.04)",
  ombreSurvol: "0 2px 6px rgba(0, 0, 0, 0.06), 0 10px 28px rgba(0, 0, 0, 0.08)",
  ombreSegment: "0 1px 3px rgba(0, 0, 0, 0.10), 0 1px 1px rgba(0, 0, 0, 0.04)",
  survolLigne: "#FAFAFC",
  /** Fond des boutons secondaires (systemGray5/6 d'Apple). */
  boutonGris: "#EEEEF3",
  boutonGrisSurvol: "#E5E5EA",
  /** Verre des barres flottantes (Liquid Glass, approximation web). */
  verreIlot: "rgba(255, 255, 255, 0.62)",
  ombreIlot: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 0 0 0.5px rgba(0, 0, 0, 0.06)",
  /** Le fond d'une colonne du pipeline, un ton sous la page. */
  couloir: "#EDEDF2",
  ombreFlottante:"0 12px 40px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06)",
} as const;

/**
 * Les couleurs système d'Apple, pour les tuiles d'icône (menu, sections,
 * résumés). Une teinte par sujet, toujours la même : le rouge pour ce qui presse,
 * le bleu pour la vente, le vert pour la mise en service. Jamais pour du texte :
 * une tuile porte un pictogramme blanc.
 */
export const TEINTES = {
  rouge: "#FF3B30", orange: "#FF9500", jaune: "#FFCC00", vert: "#34C759", menthe: "#00C7BE",
  sarcelle: "#30B0C7", cyan: "#32ADE6", bleu: "#007AFF", indigo: "#5856D6", violet: "#AF52DE",
  rose: "#FF2D55", gris: "#8E8E93",
} as const;
export type Teinte = keyof typeof TEINTES;

/**
 * Courbes et durées des transitions, celles du Dashboard (`global.css`, `--ease-panneau`
 * et `--ease-entree` ; skill `ambiance-neuracorp`). Deux courbes, pas plus : `courbe`
 * pour ce qui répond à un geste (survol, appui, panneau), `entree` pour ce qui arrive.
 * Valeurs écrites ici et non en `var()` : le thème MUI et Leaflet les lisent en JavaScript.
 */
export const MOUVEMENT = {
  courbe: "cubic-bezier(0.23, 1, 0.32, 1)",
  entree: "cubic-bezier(0.2, 0.7, 0.2, 1)",
  appui: "120ms",
  rapide: "200ms",
  normal: "220ms",
} as const;

/**
 * La température d'un dossier (lot R) : un point de couleur, un fond très clair
 * et un texte assez foncé pour se lire (contraste AA). Toujours avec son mot :
 * la couleur seule ne dit rien à qui ne la distingue pas.
 */
export const TEMPERATURE = {
  CHAUD: { point: "#FF9500", fond: "#FFEDE0", texte: "#B34700" },
  TIEDE: { point: "#FFCC00", fond: "#FFF6D6", texte: "#7A5B00" },
  FROID: { point: "#32ADE6", fond: "#E8F1FC", texte: "#0058B0" },
} as const;

/** Les feux du parc : la pastille seule, jamais sans son libellé. */
export const FEUX = { vert: "#34C759", orange: "#FF9500", rouge: "#FF3B30", gris: "#C7C7CC" } as const;

/**
 * La carte (lot U) : la couleur et le contour de chaque marqueur, et le halo blanc
 * qui le détache du fond de carte. Le contour est toujours plus sombre que le
 * remplissage, pour qu'un marqueur jaune se lise sur un fond clair. Les marqueurs
 * sont écrits en HTML pour Leaflet : ils ne peuvent pas lire le thème, d'où ces
 * valeurs ici. Jamais la couleur seule : la forme et la légende la doublent.
 * Les concurrents ont chacun une teinte, attribuée dans l'ordre de leur identifiant.
 */
export const CARTE = {
  halo: "#FFFFFF",
  /** Un client : graphite, en carré. */
  client: { point: "#1D1D1F", bord: "#000000" },
  /** Un prospect sans température (en pause). */
  pause: { point: "#8E8E93", bord: "#48484A" },
  /** Une forme sans sens de couleur, pour dire « rond : prospect, carré : client » en mode concurrents. */
  neutre: { point: "#FFFFFF", bord: "#48484A" },
  concurrents: [
    { point: "#5856D6", bord: "#35349A" },
    { point: "#AF52DE", bord: "#7A2DA3" },
    { point: "#FF2D55", bord: "#A8132E" },
    { point: "#30B0C7", bord: "#1B6B7A" },
    { point: "#34C759", bord: "#1E7A37" },
    { point: "#007AFF", bord: "#0050B3" },
    { point: "#A2845E", bord: "#6B5438" },
    { point: "#FF9500", bord: "#9A5A00" },
  ],
} as const;

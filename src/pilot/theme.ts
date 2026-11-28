"use client";

import { createTheme } from "@mui/material/styles";
import type { ChipProps } from "@mui/material/Chip";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";
import { plus } from "@/utils/theme/DefaultColors";

/**
 * Le système visuel de Pilot (CHOIX.md, C-53, après C-51) : l'esprit des
 * applications Apple pour la mise en page et les couleurs. Fond gris clair, cartes
 * blanches arrondies à ombre douce, un bleu d'accent, boutons en pilule.
 *
 * Depuis le 28/11/2026 (demande d'Enzo), la typographie et le mouvement sont ceux du
 * Dashboard : Plus Jakarta Sans pour tout (celle de `DefaultColors.tsx`, une seule
 * famille), titres en 600 à interlettrage serré comme l'accueil du Dashboard, et les
 * deux courbes de `global.css` (skill `ambiance-neuracorp`). Les couleurs et la mise
 * en page de Pilot ne changent pas.
 */

// Teintes des pastilles : fond très clair, texte assez foncé pour se lire (AA).
const SOUPLES: Partial<Record<NonNullable<ChipProps["color"]>, { fond: string; texte: string }>> = {
  primary: { fond: "#E8F1FC", texte: "#0058B0" },
  info: { fond: "#E8F1FC", texte: "#0058B0" },
  success: { fond: "#E4F7E9", texte: "#1B7A36" },
  warning: { fond: "#FFF2E0", texte: "#A0470A" },
  error: { fond: "#FFEBEA", texte: "#C4161C" },
};

// La police du Dashboard, servie par next/font (fichiers sur le même domaine, aucune requête à un tiers).
const POLICE = plus.style.fontFamily;
// Titre d'écran : 34 px, 26 sous 600 px, comme le titre de l'accueil du Dashboard (`AccueilProduit`).
const TELEPHONE = "@media (max-width:599.95px)";

const anneau = { outline: "none", boxShadow: `0 0 0 4px ${JETONS.accentAnneau}` };
const appui = `transform ${MOUVEMENT.appui} ${MOUVEMENT.courbe}`;
const transition = (proprietes: string[]) => proprietes.map((p) => p === "transform" ? appui : `${p} ${MOUVEMENT.rapide} ease`).join(", ");

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: JETONS.accent, dark: JETONS.accentFonce, contrastText: "#FFFFFF" },
    secondary: { main: JETONS.secondaire },
    success: { main: "#1B7A36", light: "#E4F7E9" },
    warning: { main: "#A0470A", light: "#FFF2E0" },
    error: { main: "#C4161C", light: "#FFEBEA" },
    info: { main: "#0058B0", light: "#E8F1FC" },
    text: { primary: JETONS.encre, secondary: JETONS.secondaire, disabled: JETONS.tertiaire },
    divider: JETONS.filet,
    background: { default: JETONS.surface, paper: "#FFFFFF" },
    action: { hover: "rgba(0, 0, 0, 0.04)", selected: "rgba(0, 0, 0, 0.06)" },
  },
  shape: { borderRadius: 12 },
  // Mêmes valeurs que le thème du Dashboard et les jetons `--ease-*` de `global.css`.
  transitions: {
    easing: { easeOut: MOUVEMENT.courbe, easeInOut: MOUVEMENT.entree },
    duration: { shortest: 120, shorter: 160, short: 200, standard: 220, complex: 280, enteringScreen: 220, leavingScreen: 160 },
  },
  typography: {
    fontFamily: POLICE,
    fontSize: 14,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: { fontSize: 34, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, [TELEPHONE]: { fontSize: 26 } },
    h2: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.012em", lineHeight: 1.3 },
    h3: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.006em", lineHeight: 1.35 },
    h4: { fontSize: 34, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, [TELEPHONE]: { fontSize: 26 } },
    h5: { fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 },
    h6: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.012em", lineHeight: 1.3 },
    subtitle1: { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
    subtitle2: { fontSize: 13, fontWeight: 600, lineHeight: 1.45 },
    body1: { fontSize: 14, lineHeight: 1.5 },
    body2: { fontSize: 13, lineHeight: 1.5 },
    caption: { fontSize: 12, lineHeight: 1.4 },
    overline: { fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", lineHeight: 1.4 },
    button: { fontSize: 14, fontWeight: 600, textTransform: "none", letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // L'accent du Dashboard (`global.css`) devient le bleu de Pilot tant que Pilot est monté :
        // les composants partagés (cloche, écrans repris, `@/lib/jetons`) prennent sa couleur et
        // non le vert d'eau de LyraeTalk. `html:root` passe devant `:root` et `[data-produit]`.
        "html:root": {
          "--accent": JETONS.accent, "--accent-rgb": "0, 113, 227",
          "--accent-press": JETONS.accentFonce, "--accent-deep": JETONS.accentFonce,
        },
        // Les surfaces que le navigateur dessine seul suivent l'accent (ambiance-neuracorp, socle).
        html: { backgroundColor: JETONS.surface, accentColor: JETONS.accent, scrollbarColor: `${JETONS.filetSurvol} transparent` },
        body: {
          fontSize: 14, lineHeight: 1.5,
          WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale", textRendering: "optimizeLegibility",
        },
        // Titres équilibrés, paragraphes sans mot seul en dernière ligne (progressif : ignoré ailleurs).
        "h1, h2, h3, h4, h5, h6": { textWrap: "balance" },
        "p, li, dd": { textWrap: "pretty" },
        // Chiffres à largeur fixe dans les tableaux et les compteurs : une colonne de montants s'aligne.
        "td, th, .chiffre, [data-chiffre], .MuiChip-label, kbd": { fontVariantNumeric: "tabular-nums" },
        "::selection": { backgroundColor: JETONS.accentFond },
        // Priorité nulle : un composant qui fixe sa couleur garde la sienne.
        ":where(a)": { color: "inherit", textDecoration: "none" },
        ":where(a:not(.MuiButtonBase-root):hover)": { color: JETONS.accent },
        ":focus-visible": { outlineColor: JETONS.accent },
        "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { transitionDuration: "0.01ms !important", animationDuration: "0.01ms !important" } },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { "&.Mui-focusVisible": anneau } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // Pilule, comme les boutons d'Apple ; 36 px de haut, une cible confortable.
        root: {
          borderRadius: 980, minHeight: 36, minWidth: 0, padding: "6px 16px", whiteSpace: "nowrap",
          transition: transition(["background-color", "border-color", "color", "box-shadow", "transform"]),
          // Appui : le bouton s'enfonce en 120 ms, comme au Dashboard ; jamais d'onde.
          "&:active": { transform: "scale(0.97)" },
        },
        sizeSmall: { minHeight: 30, padding: "3px 12px", fontSize: 13 },
        sizeLarge: { minHeight: 44, padding: "10px 22px", fontSize: 15 },
        // Bouton plein : l'action principale, une seule par vue.
        containedPrimary: { backgroundColor: JETONS.accent, fontWeight: 600, "&:hover": { backgroundColor: JETONS.accentFonce } },
        containedError: { "&:hover": { backgroundColor: "#A31217" } },
        // Bouton secondaire à la manière d'Apple : pilule grise, libellé bleu, aucune bordure.
        outlined: { border: 0, "&:hover": { border: 0 }, "&.Mui-disabled": { border: 0, backgroundColor: JETONS.gris } },
        outlinedPrimary: {
          color: JETONS.accent, backgroundColor: JETONS.boutonGris, border: 0,
          "&:hover": { backgroundColor: JETONS.boutonGrisSurvol, border: 0 },
        },
        outlinedError: { backgroundColor: JETONS.boutonGris, "&:hover": { backgroundColor: JETONS.boutonGrisSurvol } },
        textPrimary: { "&:hover": { backgroundColor: JETONS.accentFond } },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 10, transition: transition(["background-color", "color", "transform"]), "&:active": { transform: "scale(0.94)" } } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: 0, borderRadius: 18, boxShadow: JETONS.ombre } },
    },
    MuiCardContent: { styleOverrides: { root: { padding: "18px 22px", "&:last-child": { paddingBottom: 20 } } } },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderRadius: 18, border: 0, boxShadow: JETONS.ombre },
      },
    },
    MuiChip: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: ({ ownerState }) => {
          const couleur = ownerState.color ? SOUPLES[ownerState.color] : undefined;
          return {
            height: 24, borderRadius: 980, fontSize: 12, fontWeight: 500,
            backgroundColor: couleur?.fond ?? (ownerState.variant === "outlined" ? "#FFFFFF" : JETONS.gris),
            color: couleur?.texte ?? JETONS.pastille,
            borderColor: couleur ? "transparent" : JETONS.filet,
          };
        },
        label: { paddingLeft: 10, paddingRight: 10 },
        labelSmall: { paddingLeft: 10, paddingRight: 10 },
      },
    },
    // Les onglets prennent la forme d'un contrôle segmenté : un fond gris, la
    // valeur choisie posée dessus en blanc. Ils passent à la ligne, jamais en défilement.
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 36, display: "inline-flex", alignSelf: "flex-start", maxWidth: "100%", padding: 3, borderRadius: 12, backgroundColor: JETONS.segment },
        indicator: { display: "none" },
        flexContainer: { gap: 2 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 32, minWidth: 0, padding: "6px 14px", borderRadius: 9, fontSize: 14, fontWeight: 500, textTransform: "none",
          color: JETONS.secondaire, transition: transition(["background-color", "color", "box-shadow"]),
          "&:hover": { color: JETONS.encre },
          "&.Mui-selected": { color: JETONS.encre, fontWeight: 600, backgroundColor: "#FFFFFF", boxShadow: JETONS.ombreSegment },
        },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10, backgroundColor: "#FFFFFF", fontSize: 14,
          transition: transition(["box-shadow"]),
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: JETONS.filetSurvol },
          "&.Mui-focused": { boxShadow: `0 0 0 4px ${JETONS.accentAnneau}` },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: JETONS.accent, borderWidth: 1 },
        },
        input: { paddingTop: 9, paddingBottom: 9 },
        notchedOutline: { borderColor: JETONS.filetChamp },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 4, fontSize: 12 } } },
    MuiCheckbox: {
      defaultProps: { size: "small" },
      styleOverrides: { root: { color: JETONS.filetSurvol, "&.Mui-checked": { color: JETONS.accent } } },
    },
    MuiRadio: { styleOverrides: { root: { "&.Mui-checked": { color: JETONS.accent } } } },
    // Interrupteur au format iOS : piste verte, pastille blanche.
    MuiSwitch: {
      styleOverrides: {
        root: { width: 51, height: 31, padding: 0, margin: 8 },
        switchBase: {
          padding: 2, "&.Mui-checked": { transform: "translateX(20px)", color: "#FFFFFF" },
          "&.Mui-checked + .MuiSwitch-track": { backgroundColor: "#34C759", opacity: 1 },
        },
        thumb: { width: 27, height: 27, boxShadow: "0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16)" },
        track: { borderRadius: 16, backgroundColor: JETONS.segment, opacity: 1 },
      },
    },
    MuiSlider: { styleOverrides: { root: { color: JETONS.accent }, thumb: { backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,.2)" } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4, backgroundColor: JETONS.rail }, bar: { borderRadius: 4 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, fontSize: 14, alignItems: "center" },
        standardWarning: { backgroundColor: "#FFF6E8", color: "#7A3A05" },
        standardError: { backgroundColor: "#FFEFEE", color: "#9E1116" },
        standardInfo: { backgroundColor: JETONS.accentFond, color: "#00427F" },
        standardSuccess: { backgroundColor: "#EAF8EE", color: "#155F2A" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: JETONS.filetInterne, padding: "12px 22px", fontSize: 14 },
        head: { fontSize: 12, fontWeight: 600, color: JETONS.secondaire, padding: "10px 22px", backgroundColor: "#FAFAFC" },
      },
    },
    MuiTableRow: {
      styleOverrides: { root: { transition: transition(["background-color"]), "&.MuiTableRow-hover:hover": { backgroundColor: "#FAFAFC" } } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8, minHeight: 36, paddingTop: 0, paddingBottom: 0,
          transition: transition(["background-color", "color"]),
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.05)" },
          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "rgba(0, 0, 0, 0.08)" },
        },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: { root: { border: 0, borderRadius: "18px !important", boxShadow: JETONS.ombre, "&:before": { display: "none" } } },
    },
    MuiAccordionSummary: { styleOverrides: { root: { minHeight: 52, padding: "0 22px" } } },
    MuiAccordionDetails: { styleOverrides: { root: { padding: "0 22px 18px" } } },
    // Voile sans flou : un flou par-dessus les barres déjà floutées laissait une
    // bande blanche dans Chromium quand la page était défilée.
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: "rgba(0, 0, 0, 0.28)" }, invisible: { backgroundColor: "transparent" } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 22, boxShadow: JETONS.ombreFlottante } } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 20, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.3, padding: "22px 24px 8px" } } },
    MuiDialogContent: { styleOverrides: { root: { padding: "8px 24px" } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "16px 24px 22px", gap: 8 } } },
    // Durée bornée, comme au Dashboard : `auto` la faisait varier avec la hauteur du menu.
    MuiPopover: { defaultProps: { transitionDuration: { enter: 200, exit: 140 } }, styleOverrides: { paper: { borderRadius: 14, boxShadow: JETONS.ombreFlottante } } },
    MuiMenu: {
      defaultProps: { transitionDuration: { enter: 200, exit: 140 } },
      styleOverrides: {
        paper: { borderRadius: 14, border: `1px solid ${JETONS.filet}`, boxShadow: JETONS.ombreFlottante, backgroundColor: "rgba(255,255,255,.92)", backdropFilter: "saturate(180%) blur(20px)" },
        list: { padding: 6 },
      },
    },
    MuiMenuItem: { styleOverrides: { root: { fontSize: 14, borderRadius: 8, minHeight: 34, "&.Mui-selected": { backgroundColor: JETONS.accentFond } } } },
    MuiTooltip: { defaultProps: { enterDelay: 300, enterNextDelay: 0 }, styleOverrides: { tooltip: { backgroundColor: "rgba(29, 29, 31, 0.92)", fontSize: 12, borderRadius: 8, padding: "6px 10px", backdropFilter: "blur(10px)" } } },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 14, backgroundColor: JETONS.encre } } },
    MuiDivider: { styleOverrides: { root: { borderColor: JETONS.filetInterne } } },
  },
});

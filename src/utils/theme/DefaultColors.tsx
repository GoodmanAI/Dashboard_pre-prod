import { createTheme } from "@mui/material/styles";
import { Plus_Jakarta_Sans } from "next/font/google";

export const plus = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  fallback: ["Helvetica", "Arial", "sans-serif"],
});

const baselightTheme = createTheme({
  direction: "ltr",
  palette: {
    // L'accent du produit, et non plus le bleu du gabarit d'origine : tout contrôle posé
    // sans surcharge (bouton, interrupteur, case, puce, pagination) sortait en bleu au
    // milieu d'écrans verts. La palette MUI n'accepte pas `var()` : elle porte la valeur
    // de LyraeTalk, et les `styleOverrides` plus bas passent par `var(--accent)` pour que
    // les écrans Konnect (autre accent, posé par `data-produit`) suivent aussi.
    primary: {
      main: "#48C8AF",
      light: "#E6F7F3",
      dark: "#3AB19B",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#49BEFF",
      light: "#E8F7FF",
      dark: "#23afdb",
    },
    success: {
      main: "#13DEB9",
      light: "#E6FFFA",
      dark: "#02b3a9",
      contrastText: "#ffffff",
    },
    info: {
      main: "#539BFF",
      light: "#EBF3FE",
      dark: "#1682d4",
      contrastText: "#ffffff",
    },
    // Le rouge des écrans récents (`DANGER`), à la place du corail du gabarit : une action
    // destructive et un message d'erreur doivent se lire comme tels.
    error: {
      main: "#B3261E",
      light: "#FBECEB",
      dark: "#8E1D17",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#FFAE1F",
      light: "#FEF5E5",
      dark: "#ae8e59",
      contrastText: "#ffffff",
    },
    grey: {
      100: "#F2F6FA",
      200: "#EAEFF4",
      300: "#DFE5EF",
      400: "#7C8FAC",
      500: "#5A6A85",
      600: "#2A3547",
    },
    text: {
      primary: "#2A3547",
      secondary: "#5A6A85",
    },
    action: {
      disabledBackground: "rgba(73,82,88,0.12)",
      hoverOpacity: 0.02,
      hover: "#f6f9fc",
    },
    divider: "#e5eaef",
  },
  typography: {
    fontFamily: plus.style.fontFamily,
    h1: {
      fontWeight: 600,
      fontSize: "2.25rem",
      lineHeight: "2.75rem",
      fontFamily: plus.style.fontFamily,
    },
    h2: {
      fontWeight: 600,
      fontSize: "1.875rem",
      lineHeight: "2.25rem",
      fontFamily: plus.style.fontFamily,
    },
    h3: {
      fontWeight: 600,
      fontSize: "1.5rem",
      lineHeight: "1.75rem",
      fontFamily: plus.style.fontFamily,
    },
    h4: {
      fontWeight: 600,
      fontSize: "1.3125rem",
      lineHeight: "1.6rem",
    },
    h5: {
      fontWeight: 600,
      fontSize: "1.125rem",
      lineHeight: "1.6rem",
    },
    h6: {
      fontWeight: 600,
      fontSize: "1rem",
      lineHeight: "1.2rem",
    },
    // `capitalize` transformait « Retour aux tickets » en « Retour Aux Tickets » partout
    // où l'écran n'avait pas pensé à le défaire.
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
    body1: {
      fontSize: "0.875rem",
      fontWeight: 400,
      lineHeight: "1.334rem",
    },
    body2: {
      fontSize: "0.75rem",
      letterSpacing: "0rem",
      fontWeight: 400,
      lineHeight: "1rem",
    },
    subtitle1: {
      fontSize: "0.875rem",
      fontWeight: 400,
    },
    subtitle2: {
      fontSize: "0.875rem",
      fontWeight: 400,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ".MuiPaper-elevation9, .MuiPopover-root .MuiPaper-elevation": {
          boxShadow:
            "rgb(145 158 171 / 30%) 0px 0px 2px 0px, rgb(145 158 171 / 12%) 0px 12px 24px -4px !important",
        },
      },
    },
    MuiButton: {
      // Pas d'ombre sous un bouton plein : l'ombre est réservée à ce qui flotte.
      defaultProps: { disableElevation: true },
      styleOverrides: {
        containedPrimary: {
          backgroundColor: "var(--accent)",
          color: "#fff",
          boxShadow: "none",
          "&:hover": { backgroundColor: "var(--accent-press)", boxShadow: "none" },
        },
        outlinedPrimary: {
          color: "var(--accent-deep)",
          borderColor: "rgba(var(--accent-rgb), 0.55)",
          "&:hover": {
            borderColor: "var(--accent)",
            backgroundColor: "rgba(var(--accent-rgb), 0.08)",
          },
        },
        textPrimary: {
          color: "var(--accent-deep)",
          "&:hover": { backgroundColor: "rgba(var(--accent-rgb), 0.08)" },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": { color: "var(--accent)" },
          "&.Mui-checked + .MuiSwitch-track": { backgroundColor: "var(--accent)" },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: "var(--accent)" } },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: { "&.Mui-checked": { color: "var(--accent)" } },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        colorPrimary: { color: "var(--accent)" },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: "var(--accent)" },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { "&.Mui-selected": { color: "var(--accent-deep)" } },
      },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: "var(--accent)",
            color: "#fff",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--accent)",
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { "&.Mui-focused:not(.Mui-error)": { color: "var(--accent-deep)" } },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "7px",
        },
      },
    },
  },
});

export { baselightTheme };

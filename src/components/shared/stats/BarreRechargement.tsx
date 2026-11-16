"use client";

// Barre fine en haut d'un écran de statistiques pendant un rechargement (les chiffres
// précédents restent affichés, grisés). Voir `useRechargement`.
import { LinearProgress } from "@mui/material";

export default function BarreRechargement({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <LinearProgress
      aria-label="Mise à jour des chiffres"
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 1,
        bgcolor: "transparent",
        "& .MuiLinearProgress-bar": { bgcolor: "var(--accent)" },
      }}
    />
  );
}

import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { INK, INK_MUTED, BORDER, SURFACE } from "@/lib/jetons";

/**
 * Un chiffre et son libellé, pour les rangées de statistiques des écrans
 * d'exploitation (27/10/2026, liste d'attente). Le détail va dans l'info-bulle.
 */
export default function TuileChiffre({
  libelle,
  valeur,
  detail,
  aide,
  couleur = INK,
}: {
  libelle: string;
  valeur: number | string;
  detail?: string;
  aide?: string;
  couleur?: string;
}) {
  const tuile = (
    <Box
      sx={{
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
        bgcolor: SURFACE,
        px: 2,
        py: 1.5,
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          color: INK_MUTED,
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {libelle}
      </Typography>
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 700,
          color: couleur,
          lineHeight: 1.2,
          mt: 0.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valeur}
      </Typography>
      {detail && (
        <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 0.25 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
  return aide ? (
    <Tooltip title={aide} placement="top">
      {tuile}
    </Tooltip>
  ) : (
    tuile
  );
}

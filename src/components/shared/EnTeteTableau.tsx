import React from "react";
import { TableCell, Tooltip } from "@mui/material";
import { INK_MUTED, BORDER, SURFACE_MUTED } from "@/lib/jetons";

/**
 * Cellule d'en-tête des tableaux d'exploitation (demandes de rappel, liste
 * d'attente) : petites capitales, fond discret, aide au survol. Sortie le 27/10/2026
 * des écrans qui la recopiaient.
 */
export default function EnTeteTableau({
  children,
  aide,
  largeur,
}: {
  children: React.ReactNode;
  aide?: string;
  largeur?: number;
}) {
  const cellule = (
    <TableCell
      sx={{
        bgcolor: SURFACE_MUTED,
        color: INK_MUTED,
        fontWeight: 600,
        fontSize: 11.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: `1px solid ${BORDER}`,
        width: largeur,
        whiteSpace: "nowrap",
        py: 1.25,
      }}
    >
      {children}
    </TableCell>
  );
  return aide ? (
    <Tooltip title={aide} placement="top">
      {cellule}
    </Tooltip>
  ) : (
    cellule
  );
}

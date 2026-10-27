import React from "react";
import { TableCell, Tooltip } from "@mui/material";
import { INK_MUTED, BORDER, SURFACE, SURFACE_MUTED } from "@/lib/jetons";

/**
 * Colonne collée au bord droit du tableau (27/10/2026). Pour la colonne d'action d'un
 * tableau plus large que l'écran : sans elle, les boutons étaient au-delà du bord, et
 * la barre de défilement horizontale sous la dernière ligne. Collée dès `sm` ; sur un
 * téléphone, une colonne de 220 à 300 px collée mangerait tout l'écran, on défile.
 * À poser sur l'en-tête (`colle`) ET sur chaque cellule de la colonne.
 */
export const SX_COLLEE_A_DROITE = {
  position: { sm: "sticky" },
  right: { sm: 0 },
  zIndex: 1,
  bgcolor: SURFACE,
  boxShadow: { sm: `inset 1px 0 0 ${BORDER}` },
} as const;

/**
 * Cellule d'en-tête des tableaux d'exploitation (demandes de rappel, liste
 * d'attente) : petites capitales, fond discret, aide au survol. Sortie le 27/10/2026
 * des écrans qui la recopiaient.
 */
export default function EnTeteTableau({
  children,
  aide,
  largeur,
  colle = false,
}: {
  children: React.ReactNode;
  aide?: string;
  largeur?: number;
  /** Collée au bord droit, voir `SX_COLLEE_A_DROITE`. */
  colle?: boolean;
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
        ...(colle ? { ...SX_COLLEE_A_DROITE, bgcolor: SURFACE_MUTED, zIndex: 2 } : {}),
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

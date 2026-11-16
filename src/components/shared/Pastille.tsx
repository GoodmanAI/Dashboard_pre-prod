"use client";

import type { ReactNode } from "react";
import { Box } from "@mui/material";

/**
 * Pastille d'un appel (liste des appels, 16/11/2026).
 *
 * UNE SEULE FORME pour tout ce qui qualifie un appel : fond clair de la teinte, texte foncé
 * de la même teinte, petit point de la couleur vive. Avant, trois styles se mélangeaient
 * (plein vif, contour coloré, gris) et 22 combinaisons sur 36 relevées chez Pontivy
 * passaient sous le contraste lisible (4,5:1), jusqu'à du rouge foncé sur rouge (1,7:1).
 * Toutes les teintes ci-dessous sont entre 4,8:1 et 8,8:1.
 *
 * Seules les ALERTES restent pleines, pour se détacher : urgence, incident, mineur,
 * service désactivé.
 *
 * Codes couleur gardés (demande d'Enzo) : vert = rendez-vous pris, jaune = modifié,
 * rouge = annulé ; les redirections gardent la teinte de leur catégorie
 * (`CATEGORY_META` de `src/lib/transferReasons.ts`, champs `bg`, `textColor`, `color`).
 */

export type TonPastille = {
  /** Fond (couleur ou rgba). */
  fond: string;
  /** Texte, contraste de 4,5:1 au moins sur le fond. */
  texte: string;
  /** Point de couleur vive devant le libellé ; absent : pas de point. */
  point?: string;
  /** Bordure fine (pastille secondaire, sur fond blanc). */
  bord?: string;
};

/** Les teintes de la liste des appels. */
export const TONS = {
  rdv: { fond: "#DCFCE7", texte: "#166534", point: "#22C55E" },
  confirme: { fond: "#D1FAE5", texte: "#065F46", point: "#10B981" },
  examen: { fond: "#FFFFFF", texte: "#166534", bord: "#BBF7D0" },
  modifie: { fond: "#FEF3C7", texte: "#854D0E", point: "#EAB308" },
  annule: { fond: "#FFE4E6", texte: "#9F1239", point: "#F43F5E" },
  info: { fond: "#E0F2FE", texte: "#075985", point: "#0EA5E9" },
  neutre: { fond: "#F1F5F9", texte: "#475569" },
  /** Contexte secondaire (pourquoi l'appel s'est arrêté) : contour, point de sa couleur. */
  contexte: { fond: "#FFFFFF", texte: "#475569", bord: "#E2E8F0" },
  // Alertes, pleines.
  urgence: { fond: "#A21CAF", texte: "#FFFFFF" },
  incident: { fond: "#DC2626", texte: "#FFFFFF" },
  mineur: { fond: "#C2410C", texte: "#FFFFFF" },
  desactive: { fond: "#B91C1C", texte: "#FFFFFF" },
} satisfies Record<string, TonPastille>;

export default function Pastille({
  libelle,
  ton,
  icone,
  titre,
}: {
  libelle: string;
  ton: TonPastille;
  /** Icône à la place du point (drapeau de l'incident). */
  icone?: ReactNode;
  /** Info-bulle native, quand le libellé est abrégé. */
  titre?: string;
}) {
  return (
    <Box
      component="span"
      title={titre}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        minHeight: 24,
        px: 1.25,
        py: 0.4,
        // Un libellé long passe à la ligne sur téléphone au lieu d'être tronqué.
        borderRadius: "12px",
        bgcolor: ton.fond,
        color: ton.texte,
        border: `1px solid ${ton.bord ?? "transparent"}`,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.25,
        whiteSpace: { xs: "normal", sm: "nowrap" },
        maxWidth: "100%",
        flexShrink: 0,
      }}
    >
      {icone ??
        (ton.point ? (
          <Box
            component="span"
            aria-hidden
            sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: ton.point, flexShrink: 0 }}
          />
        ) : null)}
      <Box component="span">{libelle}</Box>
    </Box>
  );
}

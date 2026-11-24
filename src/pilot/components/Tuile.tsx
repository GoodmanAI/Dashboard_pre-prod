import type { Icon } from "@tabler/icons-react";
import Box from "@mui/material/Box";
import { TEINTES, type Teinte } from "@/pilot/jetons";

export type Icone = Icon;

/**
 * Une tuile d'icône à la manière de Réglages Système : pictogramme blanc sur un
 * carré arrondi de couleur, avec un léger dégradé pour le relief. `rond` en fait
 * le disque des listes de Rappels. Décorative : le texte voisin porte le sens.
 */
export function Tuile({ Icone, teinte, taille = 28, rond = false }: { Icone: Icone; teinte: Teinte; taille?: number; rond?: boolean }) {
  const couleur = TEINTES[teinte];
  return <Box aria-hidden sx={{
    width: taille, height: taille, flexShrink: 0, display: "grid", placeItems: "center", color: "common.white",
    borderRadius: rond ? "50%" : `${Math.round(taille * 0.24)}px`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${couleur} 82%, white) 0%, ${couleur} 100%)`,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12), inset 0 0.5px 0 rgba(255, 255, 255, 0.35)",
  }}>
    <Icone size={Math.round(taille * 0.58)} stroke={2} />
  </Box>;
}

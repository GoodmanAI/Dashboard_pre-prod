"use client";

import { Box, IconButton, Typography } from "@mui/material";
import { IconX } from "@tabler/icons-react";
import { usePremiersPas } from "@/hooks/usePremiersPas";
import { useIntegre } from "@/lib/recherche/integre";
import { BORDER, INK_MUTED, SURFACE_MUTED } from "@/lib/jetons";

/**
 * Une phrase en haut d'une page de statistiques, une seule fois par personne (lot 3 du
 * plan `2026-10-onboarding-dashboard-talk.md`). Enzo n'en veut pas plus : ces pages se
 * lisent seules, un nouveau client doit seulement savoir qu'il n'a rien à y remplir.
 *
 * Contrairement à la carte, elle paraît aussi pour un sous-compte en lecture seule
 * (c'est souvent lui qui regarde les chiffres), jamais pour un administrateur ni dans
 * le panneau de la recherche.
 */
export default function PhraseStatistiques({
  cle,
  texte,
}: {
  cle: string;
  texte: string;
}) {
  const integre = useIntegre();
  const { etat, admin, agir } = usePremiersPas();

  if (integre || admin || !etat || etat.phrases.includes(cle)) return null;

  return (
    <PhraseStatistiquesVue
      texte={texte}
      onFermer={() => void agir({ phrase: cle })}
    />
  );
}

/** La phrase seule, pour la page d'aperçu. */
export function PhraseStatistiquesVue({
  texte,
  onFermer,
}: {
  texte: string;
  onFermer: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        mb: 2,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
        bgcolor: SURFACE_MUTED,
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
      }}
    >
      <Typography variant="body2" sx={{ color: INK_MUTED, flex: 1 }}>
        {texte}
      </Typography>
      <IconButton size="small" aria-label="Fermer" onClick={onFermer}>
        <IconX size={16} />
      </IconButton>
    </Box>
  );
}

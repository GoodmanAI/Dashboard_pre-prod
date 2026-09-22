"use client";

import { Box, Button, Typography } from "@mui/material";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import React from "react";

/**
 * En-tête de section admin : barre d'accent teal + titre h5 800 + sous-titre optionnel.
 * Emplacement pour slot d'actions à droite (boutons, toggles, chips…).
 *
 * `retour` pose le lien de retour au-dessus du titre, discret : c'est l'action la moins
 * importante de la page, elle n'a pas à en être le bouton le plus voyant. Il mène à une
 * adresse nommée, jamais à `router.back()`, qui peut conduire n'importe où quand
 * l'écran a été ouvert depuis le menu.
 */
export default function SectionHeader({
  title,
  subtitle,
  actions,
  retour,
}: {
  title: string;
  /** Une phrase, ou un fragment quand il faut du gras ou un lien. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  retour?: { libelle: string; href: string };
}) {
  return (
    <>
      {retour && (
        <Button
          component={Link}
          href={retour.href}
          variant="text"
          size="small"
          startIcon={<IconArrowLeft size={16} />}
          sx={{
            color: "text.secondary",
            mb: 1.5,
            ml: -1,
            px: 1,
            fontWeight: 500,
            "&:hover": {
              bgcolor: "rgba(var(--accent-rgb), 0.08)",
              color: "var(--accent-deep)",
            },
          }}
        >
          {retour.libelle}
        </Button>
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          flexWrap: "wrap",
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 4,
              height: 36,
              borderRadius: 2,
              bgcolor: "var(--accent)",
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" fontWeight={800} lineHeight={1.1}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {actions && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {actions}
          </Box>
        )}
      </Box>
    </>
  );
}

"use client";

import { Box, Typography } from "@mui/material";
import React from "react";

/**
 * En-tête de section admin : barre d'accent teal + titre h5 800 + sous-titre optionnel.
 * Emplacement pour slot d'actions à droite (boutons, toggles, chips…).
 */
export default function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        flexWrap: "wrap",
        mb: 3,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
        <Box sx={{ width: 4, height: 36, borderRadius: 2, bgcolor: "#48C8AF", flexShrink: 0 }} />
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
      {actions && <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>{actions}</Box>}
    </Box>
  );
}

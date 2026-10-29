"use client";

// Cartes de l'écran des statistiques internes, partagées par la page et par la section V2
// (SectionV2.tsx). Sorties de page.tsx le 29/10/2026 : une page de l'App Router n'exporte
// que son composant.
import React from "react";
import { Box, Card, Divider, Typography } from "@mui/material";

export function KpiCard({
  label,
  value,
  icon,
  valueColor,
  suffix,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  valueColor?: string;
  suffix?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: "rgba(72,200,175,0.05)",
        border: "1px solid rgba(72,200,175,0.15)",
        height: "100%",
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(72,200,175,0.12)",
          color: "#2a6f64",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
          {label}
        </Typography>
        <Typography
          variant="h6"
          fontWeight={800}
          sx={{ color: valueColor, lineHeight: 1.2 }}
          noWrap
        >
          {value}
          {suffix && (
            <Typography component="span" variant="caption" sx={{ ml: 0.5, fontWeight: 500 }}>
              {suffix}
            </Typography>
          )}
        </Typography>
      </Box>
    </Box>
  );
}

/** Section card avec entête : icône, titre, sous-titre, contenu. */
export function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card elevation={1} sx={{ p: { xs: 2.5, md: 3 }, height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(72,200,175,0.12)",
            color: "#2a6f64",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider sx={{ mb: 2.5 }} />
      {children}
    </Card>
  );
}

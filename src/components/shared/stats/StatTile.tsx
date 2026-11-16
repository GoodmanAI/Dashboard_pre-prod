"use client";

// Tuiles de chiffres des écrans de statistiques (sorties de talk/stats_appel/Ecran.tsx le
// 14/11/2026 pour être partagées avec les statistiques de Konnect). Rien n'a changé dans
// leur rendu.
import React from "react";
import {
  Box,
  Paper,
  Skeleton,
  Tooltip as MuiTooltip,
  Typography,
} from "@mui/material";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import type { DeltaResult } from "@/lib/deltaCompare";
import Compteur from "./Compteur";

/** Petit badge delta affiché sous la valeur principale d'une StatTile. */
export function DeltaBadge({
  delta,
  previousLabel,
}: {
  delta: DeltaResult;
  previousLabel: string;
}) {
  // "insufficient" → on n'affiche rien (signal silencieux : période précédente
  // trop petite pour être statistiquement fiable).
  if (delta.kind === "insufficient") return null;

  const TONE_COLORS: Record<
    "positive" | "negative" | "neutral",
    { color: string; bg: string }
  > = {
    positive: { color: "#15803d", bg: "rgba(34,197,94,0.15)" },
    negative: { color: "#b91c1c", bg: "rgba(239,68,68,0.15)" },
    neutral: { color: "#4b5563", bg: "rgba(156,163,175,0.18)" },
  };

  let label: string;
  let tone: "positive" | "negative" | "neutral" = "neutral";
  let icon: React.ReactNode = null;
  let tooltipExtra = "";

  if (delta.kind === "equal") {
    label = "=";
    tone = "neutral";
    tooltipExtra = `Identique à la période précédente (${delta.previous})`;
  } else if (delta.kind === "new") {
    label = "Nouveau";
    tone = "positive";
    tooltipExtra = `Aucune donnée sur la période précédente (${previousLabel})`;
  } else {
    // delta.kind === "delta"
    const formatted = `${delta.pct > 0 ? "+" : ""}${delta.pct}%`;
    icon =
      delta.sign === "up" ? (
        <IconTrendingUp size={12} />
      ) : (
        <IconTrendingDown size={12} />
      );
    label = formatted;
    tone = delta.tone;
    tooltipExtra = `vs ${delta.previous} ${previousLabel}`;
  }

  const t = TONE_COLORS[tone];
  return (
    <MuiTooltip title={tooltipExtra} arrow placement="top">
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          mt: 0.25,
          px: 0.75,
          py: 0.1,
          borderRadius: 0.75,
          bgcolor: t.bg,
          color: t.color,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.4,
          cursor: "help",
        }}
      >
        {icon}
        {label}
      </Box>
    </MuiTooltip>
  );
}

export function StatTile({
  title,
  value,
  icon,
  delta,
  previousLabel,
  subDetail,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  /** Si fourni, affiche un badge "↗ +18%" sous la valeur. */
  delta?: DeltaResult;
  /** Suffixe humain pour le tooltip du badge (ex: "sur la semaine précédente"). */
  previousLabel?: string;
  /** Ligne de détail sous la valeur (ex: "2 + 8 (Rappel SMS)"). */
  subDetail?: string;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        minHeight: 96,
      }}
      elevation={1}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          // Couleur du produit affiché (vert Talk, bleu Konnect), plus jamais en dur.
          bgcolor: "rgba(var(--accent-rgb), 0.15)",
          color: "var(--accent-deep)",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700} noWrap>
          <Compteur valeur={value} />
        </Typography>
        {subDetail && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", lineHeight: 1.2 }}
            noWrap
          >
            {subDetail}
          </Typography>
        )}
        {delta && (
          <DeltaBadge delta={delta} previousLabel={previousLabel ?? ""} />
        )}
      </Box>
    </Paper>
  );
}

export function StatTileDouble({
  items,
  icon,
}: {
  items: {
    title: string;
    value: string | number;
    /** Si fourni, badge delta affiché sous la valeur de cet item. */
    delta?: DeltaResult;
    previousLabel?: string;
    /** Ligne de détail sous la valeur (ex: "2 + 8 (Rappel SMS)"). */
    subDetail?: string;
  }[];
  icon: React.ReactNode;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        minHeight: 96,
      }}
      elevation={1}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          // Couleur du produit affiché (vert Talk, bleu Konnect), plus jamais en dur.
          bgcolor: "rgba(var(--accent-rgb), 0.15)",
          color: "var(--accent-deep)",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ display: "flex", gap: 3, minWidth: 0, flex: 1 }}>
        {items.map((item, idx) => (
          <Box key={idx} sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {item.title}
            </Typography>
            <Typography variant="h5" fontWeight={700} noWrap>
              <Compteur valeur={item.value} />
            </Typography>
            {item.subDetail && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", lineHeight: 1.2 }}
                noWrap
              >
                {item.subDetail}
              </Typography>
            )}
            {item.delta && (
              <DeltaBadge
                delta={item.delta}
                previousLabel={item.previousLabel ?? ""}
              />
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export function StatTileSkeleton() {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        // Même hauteur minimale que la tuile pleine : rien ne saute à l'arrivée des chiffres.
        minHeight: 96,
      }}
      elevation={1}
    >
      <Skeleton
        variant="rounded"
        width={48}
        height={48}
        sx={{ borderRadius: "10px" }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Skeleton variant="text" width={120} height={18} />
        <Skeleton variant="text" width="60%" height={30} />
      </Box>
    </Paper>
  );
}

export function ChartSkeleton() {
  return (
    <Box
      sx={{ width: "100%", height: 280, display: "grid", placeItems: "center" }}
    >
      <Skeleton variant="rounded" width="100%" height="100%" />
    </Box>
  );
}

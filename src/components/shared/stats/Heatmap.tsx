"use client";

// Carte jour × heure des écrans de statistiques (sortie de talk/stats_appel/Ecran.tsx le
// 14/11/2026 pour être partagée avec les statistiques de Konnect). Ajout : `ouvert`, qui
// encadre les heures d'ouverture du centre.
import React from "react";
import { Box, Tooltip as MuiTooltip, Typography } from "@mui/material";

/** Jours en français, ordre européen (Lun → Dim). */
export const HEATMAP_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const HEATMAP_DAYS_FULL = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/**
 * Heatmap 7 jours × 24 heures. Une cellule par créneau, coloration par
 * intensité (clair → foncé) en fonction du max global de la matrice.
 *
 * - `colorRgb` : "R, G, B" — la cellule devient `rgba(R,G,B, 0.15→1)` selon
 *   l'intensité. Cellules vides : gris très clair.
 * - Tooltip au survol avec jour/heure/valeur.
 */
export function Heatmap({
  matrix,
  max,
  colorRgb,
  metricLabel,
  ouvert,
  legendeOuvert,
}: {
  matrix: number[][];
  max: number;
  colorRgb: string;
  metricLabel: string;
  /** 7 × 24, vrai pour une heure d'ouverture du centre : la cellule est encadrée. */
  ouvert?: boolean[][];
  /** Texte de la légende de l'encadré (« Heures d'ouverture »). */
  legendeOuvert?: string;
}) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ minWidth: 720, display: "inline-block" }}>
        {/* Header heures (00 → 23, label 1 sur 2 pour pas surcharger) */}
        <Box sx={{ display: "flex", gap: "3px", pl: "44px", mb: 0.5 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <Box
              key={h}
              sx={{
                width: 24,
                textAlign: "center",
                fontSize: 9,
                color: "#9ca3af",
                fontWeight: 600,
              }}
            >
              {h % 2 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
            </Box>
          ))}
        </Box>

        {/* Lignes : 7 jours */}
        {matrix.map((row, dayIdx) => (
          <Box
            key={dayIdx}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              mb: "3px",
            }}
          >
            <Box
              sx={{
                width: 40,
                textAlign: "right",
                pr: 1,
                fontSize: 11,
                color: "#374151",
                fontWeight: 600,
              }}
            >
              {HEATMAP_DAYS[dayIdx]}
            </Box>
            {row.map((value, h) => {
              const intensity = max > 0 ? value / max : 0;
              const isEmpty = value === 0;
              const bg = isEmpty
                ? "rgba(0,0,0,0.04)"
                : `rgba(${colorRgb}, ${0.18 + intensity * 0.82})`;
              return (
                <MuiTooltip
                  key={h}
                  arrow
                  placement="top"
                  title={
                    isEmpty
                      ? `${HEATMAP_DAYS_FULL[dayIdx]} ${String(h).padStart(2, "0")}h : aucun`
                      : `${HEATMAP_DAYS_FULL[dayIdx]} ${String(h).padStart(2, "0")}h : ${value} ${metricLabel}`
                  }
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "4px",
                      bgcolor: bg,
                      outline: ouvert?.[dayIdx]?.[h]
                        ? "1.5px solid rgba(15,23,42,0.45)"
                        : "none",
                      outlineOffset: "-1.5px",
                      transition: "transform 120ms ease, box-shadow 120ms ease",
                      cursor: "pointer",
                      "&:hover": {
                        transform: "scale(1.4)",
                        zIndex: 2,
                        boxShadow: `0 4px 12px rgba(${colorRgb}, 0.4)`,
                      },
                    }}
                  />
                </MuiTooltip>
              );
            })}
          </Box>
        ))}

        {/* Légende intensité */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 1.5,
            pl: "44px",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10 }}
          >
            Moins
          </Typography>
          {[0.18, 0.36, 0.54, 0.72, 1].map((alpha) => (
            <Box
              key={alpha}
              sx={{
                width: 16,
                height: 12,
                borderRadius: "3px",
                bgcolor: `rgba(${colorRgb}, ${alpha})`,
              }}
            />
          ))}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10 }}
          >
            Plus
          </Typography>
          {ouvert && (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: 2 }}
            >
              <Box
                sx={{
                  width: 16,
                  height: 12,
                  borderRadius: "3px",
                  outline: "1.5px solid rgba(15,23,42,0.45)",
                  outlineOffset: "-1.5px",
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10 }}
              >
                {legendeOuvert ?? "Heures d'ouverture"}
              </Typography>
            </Box>
          )}
          {max > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, ml: 2 }}
            >
              Max sur la période : <strong>{max}</strong>
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

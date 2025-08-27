"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Box, Typography, Paper } from "@mui/material";
import { useState } from "react";
import CustomTooltip from "./CustomTooltip";

/**
 * Représente une ligne de données par mois.
 * - `month` : libellé du mois (clé X).
 * - autres clés dynamiques : indicateurs numériques (0–100) à tracer.
 */
interface MultiCurveData {
  month: string;
  [key: string]: string | number;
}

/**
 * Décrit une courbe disponible sur le graphique.
 * - `key`   : clé présente dans `data` correspondant à l’indicateur.
 * - `label` : libellé affiché dans la légende.
 * - `color` : couleur de la courbe (hex/RGB).
 */
interface CurveDefinition {
  key: string;
  label: string;
  color: string;
}

/**
 * Propriétés du composant `MultiCurveChart`.
 * - `data`     : série temporelle mensuelle.
 * - `curves`   : liste des courbes (définitions).
 * - `title`    : titre du bloc.
 * - `subtitle` : sous-titre du bloc.
 * - `height`   : hauteur du conteneur (px).
 */
interface MultiCurveChartProps {
  data: MultiCurveData[];
  curves: CurveDefinition[];
  title?: string;
  subtitle?: string;
  height?: number;
}

/**
 * Composant de visualisation multi-courbes (Recharts).
 * Responsabilités :
 * - Afficher une légende interactive permettant d’afficher/masquer chaque indicateur.
 * - Rendre un graphique réactif (responsive) avec grille, axes, et infobulle personnalisée.
 * - Garantir la lisibilité dans un conteneur à hauteur contrainte.
 */
const MultiCurveChart = ({
  data,
  curves,
  title = "Les avis de votre service",
  subtitle = "Visualisation mensuelle des indicateurs",
  height = 400,
}: MultiCurveChartProps) => {
  /** État local : visibilité par courbe (initialement toutes visibles). */
  const initialVisibility = Object.fromEntries(curves.map((c) => [c.key, true]));
  const [visibleCurves, setVisibleCurves] = useState(initialVisibility);

  /** Gestionnaire : bascule la visibilité d’une courbe donnée. */
  const toggleCurve = (key: string) => {
    setVisibleCurves((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Paper
      sx={{
        p: 2,
        height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* En-tête : titre, sous-titre et légende interactive compacte */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="subtitle2" fontWeight={300} color="text.secondary">
            {subtitle}
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            alignItems: "center",
            justifyContent: "flex-end",
            maxWidth: "100%",
            mt: { xs: 1, md: 0 },
          }}
        >
          {curves.map((curve) => (
            <Box
              key={curve.key}
              onClick={() => toggleCurve(curve.key)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
                fontSize: "0.75rem",
                lineHeight: 1.1,
                opacity: visibleCurves[curve.key] ? 1 : 0.4,
                transition: "opacity 0.2s ease-in-out",
              }}
              aria-label={`Basculer la courbe ${curve.label}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleCurve(curve.key);
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: curve.color,
                  mr: 0.5,
                }}
              />
              <Typography
                component="span"
                sx={{
                  fontSize: "0.75rem",
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                }}
              >
                {curve.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Zone graphique : conteneur responsive + configuration du LineChart */}
      <Box sx={{ flexGrow: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            {/* Grille légère pour améliorer la lecture */}
            <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />

            {/* Axes : X sur le mois, Y borné 0–100 (scores/%) */}
            <XAxis dataKey="month" />
            <YAxis domain={[0, 100]} tickCount={6} />

            {/* Infobulle personnalisée (formatage et styles centralisés) */}
            <Tooltip content={<CustomTooltip />} />

            {/* Tracé conditionnel de chaque courbe selon sa visibilité */}
            {curves.map(
              (curve) =>
                visibleCurves[curve.key] && (
                  <Line
                    key={curve.key}
                    type="monotone"
                    dataKey={curve.key}
                    stroke={curve.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
};

export default MultiCurveChart;

"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Stack,
  Tab,
  Tabs,
  Tooltip as MuiTooltip,
  Typography,
} from "@mui/material";
import {
  AggregatedFunnel,
  COMMON_STAGES,
  FUNNEL_LOW_SAMPLE_THRESHOLD,
  INTENT_LABELS,
  IntentKey,
  STAGE_LABELS,
  SubFunnelData,
  TRACKED_INTENTS,
  computeFunnel,
} from "@/lib/callFunnel";

/**
 * Mini-funnel hiérarchique par centre :
 *   - 2 barres communes en tête (Accueil, Intention) — base = tous les appels
 *   - KPI de conversion globale
 *   - Tabs par intent tracké (Prise / Modif / Confirm / …) affichant leur
 *     sous-funnel détaillé (uniquement les intents avec ≥ 1 appel sur la
 *     période, triés par volume décroissant)
 *
 * Composant read-only : aucun clic (la card parent porte la nav).
 */

const STAGE_COLOR = "#48C8AF"; // teal brand
const DROP_ACCENT = "#f97316";
const DROP_ACCENT_BG = "#fff7ed";

type Props = { calls: unknown[] };

export default function FunnelMiniChart({ calls }: Props) {
  const funnel = useMemo(() => computeFunnel(calls), [calls]);

  // Sous-funnels présents (au moins 1 appel), triés par volume décroissant
  // pour que la tab la plus "grosse" soit ouverte par défaut.
  const sortedIntents: IntentKey[] = useMemo(() => {
    if (!funnel) return [];
    return TRACKED_INTENTS.filter((k) => funnel.subFunnels[k]).sort(
      (a, b) =>
        (funnel.subFunnels[b]?.totalCalls ?? 0) -
        (funnel.subFunnels[a]?.totalCalls ?? 0)
    );
  }, [funnel]);

  const [activeIntent, setActiveIntent] = useState<IntentKey | null>(null);
  const currentIntent: IntentKey | null =
    activeIntent && sortedIntents.includes(activeIntent)
      ? activeIntent
      : sortedIntents[0] ?? null;

  // État vide global (aucun appel avec funnel sur la période)
  if (!funnel) {
    return (
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ mt: 2, pt: 2, borderTop: "1px dashed #e5e7eb", cursor: "default" }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", fontSize: 10, letterSpacing: 0.5, mb: 0.5 }}
        >
          FUNNEL DE CONVERSION
        </Typography>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontStyle: "italic" }}
        >
          Aucun appel avec funnel disponible sur la période.
        </Typography>
      </Box>
    );
  }

  const lowSample = funnel.totalCalls < FUNNEL_LOW_SAMPLE_THRESHOLD;

  return (
    <Box
      // La card parente (CentreTodayCard) porte un onClick qui navigue vers
      // la page stats du centre. Sans stopPropagation, cliquer sur les tabs
      // ou n'importe où dans le funnel déclencherait cette nav — l'utilisateur
      // ne peut alors pas changer de sous-funnel. On coupe le bubbling ici,
      // pour toute la zone du funnel, et on remet un cursor default pour ne
      // pas laisser croire que la zone est cliquable pour naviguer.
      onClick={(e) => e.stopPropagation()}
      sx={{
        mt: 2,
        pt: 2,
        borderTop: "1px dashed #e5e7eb",
        opacity: lowSample ? 0.55 : 1,
        transition: "opacity 250ms ease",
        cursor: "default",
      }}
    >
      {/* ---------- Header : titre + volume ---------- */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: 10, letterSpacing: 0.5, fontWeight: 600 }}
        >
          FUNNEL DE CONVERSION
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {lowSample && (
            <Chip
              size="small"
              label="échantillon faible"
              sx={{
                height: 16,
                fontSize: 9,
                bgcolor: "rgba(156,163,175,0.2)",
                color: "#4b5563",
                fontWeight: 600,
              }}
            />
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10, fontWeight: 600 }}
          >
            {funnel.totalCalls} appel{funnel.totalCalls > 1 ? "s" : ""}
          </Typography>
        </Stack>
      </Box>

      {/* ---------- 2 barres communes : Accueil, Intention ---------- */}
      <Stack spacing={0.5}>
        {COMMON_STAGES.map((stage, idx) => {
          const count = stage === "answered" ? funnel.answeredCount : funnel.intentCapturedCount;
          const percent = stage === "answered" ? funnel.answeredPct : funnel.intentCapturedPct;
          return (
            <StageBar
              key={stage}
              label={STAGE_LABELS[stage]}
              count={count}
              percent={percent}
              color={STAGE_COLOR}
              index={idx}
            />
          );
        })}
      </Stack>

      {/* ---------- KPI Conversion globale ---------- */}
      <Box
        sx={{
          mt: 1.5,
          pt: 1.25,
          borderTop: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}
        >
          CONVERSION GLOBALE
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              lineHeight: 1,
              color:
                funnel.globalConversionPct >= 50
                  ? "#15803d"
                  : funnel.globalConversionPct >= 25
                  ? "#92400e"
                  : "#b91c1c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {funnel.globalConversionPct.toFixed(0)}%
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10 }}
          >
            ({funnel.totalGoalsAchieved}/{funnel.totalCalls})
          </Typography>
        </Stack>
      </Box>

      {/* ---------- Tabs par intent + sous-funnel ---------- */}
      {sortedIntents.length > 0 && currentIntent && funnel.subFunnels[currentIntent] ? (
        <Box sx={{ mt: 2 }}>
          <Tabs
            value={currentIntent}
            onChange={(_, v) => setActiveIntent(v as IntentKey)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 32,
              mb: 1,
              borderBottom: 1,
              borderColor: "divider",
              "& .MuiTab-root": {
                minHeight: 32,
                py: 0.5,
                px: 1,
                textTransform: "none",
                fontSize: 10.5,
                fontWeight: 600,
              },
              "& .Mui-selected": { color: "#2a6f64 !important" },
              "& .MuiTabs-indicator": { backgroundColor: STAGE_COLOR },
            }}
          >
            {sortedIntents.map((intent) => {
              const sub = funnel.subFunnels[intent]!;
              return (
                <Tab
                  key={intent}
                  value={intent}
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>{INTENT_LABELS[intent]}</span>
                      <Chip
                        size="small"
                        label={sub.totalCalls}
                        sx={{
                          height: 15,
                          fontSize: 9,
                          fontWeight: 700,
                          bgcolor: "rgba(72,200,175,0.15)",
                          color: "#2a6f64",
                          "& .MuiChip-label": { px: 0.6 },
                        }}
                      />
                    </Stack>
                  }
                />
              );
            })}
          </Tabs>

          <SubFunnelView sub={funnel.subFunnels[currentIntent]!} />
        </Box>
      ) : (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: "block", mt: 1.5, fontStyle: "italic" }}
        >
          Aucun intent capté avec sous-funnel disponible.
        </Typography>
      )}
    </Box>
  );
}

/**
 * Vue d'un sous-funnel : barres des étapes de l'intent actif + KPI "goal
 * atteint pour cet intent" + badge sur la plus grosse fuite.
 */
function SubFunnelView({ sub }: { sub: SubFunnelData }) {
  const stages = Object.keys(sub.stageCounts);
  const dropStage = sub.biggestDrop?.stage;

  return (
    <Box>
      <Stack spacing={0.5}>
        {stages.map((stage, idx) => {
          const count = sub.stageCounts[stage] ?? 0;
          const percent = sub.stagePercents[stage] ?? 0;
          const isDrop = dropStage === stage;
          const prevPercent =
            idx === 0 ? 100 : sub.stagePercents[stages[idx - 1]] ?? 100;
          const dropFromPrev = idx === 0 ? 0 : prevPercent - percent;

          return (
            <StageBar
              key={stage}
              label={STAGE_LABELS[stage] ?? stage}
              count={count}
              percent={percent}
              color={STAGE_COLOR}
              index={idx}
              isDrop={isDrop}
              dropPctFromPrev={dropFromPrev}
              dropBadgePct={isDrop ? sub.biggestDrop?.dropPct : undefined}
              prevLabel={
                idx > 0 ? STAGE_LABELS[stages[idx - 1]] ?? stages[idx - 1] : ""
              }
            />
          );
        })}
      </Stack>

      {/* Sous-conversion */}
      <Box
        sx={{
          mt: 1,
          pt: 1,
          borderTop: "1px dotted #f3f4f6",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}
        >
          OBJECTIF ATTEINT
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="baseline">
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color:
                sub.goalAchievedPct >= 50
                  ? "#15803d"
                  : sub.goalAchievedPct >= 25
                  ? "#92400e"
                  : "#b91c1c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {sub.goalAchievedPct.toFixed(0)}%
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10 }}
          >
            ({sub.goalAchievedCount}/{sub.totalCalls})
          </Typography>
        </Stack>
      </Box>

      {sub.biggestDrop && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.5,
            fontSize: 10,
            color: DROP_ACCENT,
            fontWeight: 600,
          }}
        >
          Fuite : {STAGE_LABELS[sub.biggestDrop.stage] ?? sub.biggestDrop.stage}{" "}
          (−{sub.biggestDrop.dropPct.toFixed(0)}%)
        </Typography>
      )}
    </Box>
  );
}

/**
 * Une barre horizontale d'étape : label, jauge animée, valeur numérique,
 * badge orange si c'est la fuite max. Extrait pour réutilisation dans les
 * étapes communes et dans le sous-funnel.
 */
function StageBar({
  label,
  count,
  percent,
  color,
  index,
  isDrop = false,
  dropPctFromPrev = 0,
  dropBadgePct,
  prevLabel = "",
}: {
  label: string;
  count: number;
  percent: number;
  color: string;
  index: number;
  isDrop?: boolean;
  dropPctFromPrev?: number;
  dropBadgePct?: number;
  prevLabel?: string;
}) {
  const tooltip = (
    <Box sx={{ py: 0.25 }}>
      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ display: "block", opacity: 0.85 }}>
        {count} appel{count > 1 ? "s" : ""} ({percent.toFixed(0)}%)
      </Typography>
      {index > 0 && dropPctFromPrev > 0 && (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "#fdba74", mt: 0.25 }}
        >
          Chute de {dropPctFromPrev.toFixed(0)} pts depuis {prevLabel}
        </Typography>
      )}
    </Box>
  );

  return (
    <MuiTooltip title={tooltip} arrow placement="left">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "default",
          bgcolor: isDrop ? DROP_ACCENT_BG : "transparent",
          borderRadius: 0.5,
          px: isDrop ? 0.5 : 0,
          py: isDrop ? 0.25 : 0,
          transition: "background-color 200ms ease",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            width: 100,
            fontSize: 10,
            color: "text.secondary",
            fontWeight: 500,
            flexShrink: 0,
          }}
          noWrap
        >
          {label}
        </Typography>
        <Box
          sx={{
            flex: 1,
            height: 10,
            bgcolor: "rgba(0,0,0,0.05)",
            borderRadius: 0.75,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Box
            sx={{
              width: `${Math.max(1, percent)}%`,
              height: "100%",
              bgcolor: color,
              borderRadius: 0.75,
              animation: `funnelBarGrow 500ms ease-out ${index * 60}ms both`,
              transformOrigin: "left",
              "@keyframes funnelBarGrow": {
                from: { transform: "scaleX(0)" },
                to: { transform: "scaleX(1)" },
              },
            }}
          />
        </Box>
        <Typography
          variant="caption"
          sx={{
            width: 60,
            textAlign: "right",
            fontSize: 10,
            fontWeight: 700,
            color: "text.primary",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {percent.toFixed(0)}%{" "}
          <Typography
            component="span"
            sx={{ fontSize: 9, fontWeight: 500, color: "text.secondary" }}
          >
            ({count})
          </Typography>
        </Typography>
        {isDrop && dropBadgePct !== undefined && (
          <Chip
            size="small"
            label={`−${dropBadgePct.toFixed(0)}%`}
            sx={{
              height: 14,
              fontSize: 9,
              fontWeight: 700,
              bgcolor: DROP_ACCENT,
              color: "#fff",
              flexShrink: 0,
              "& .MuiChip-label": { px: 0.5 },
            }}
          />
        )}
      </Box>
    </MuiTooltip>
  );
}

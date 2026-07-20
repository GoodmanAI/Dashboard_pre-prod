"use client";

import { Box, Chip, Stack, Tooltip as MuiTooltip, Typography } from "@mui/material";
import {
  FUNNEL_LABELS,
  FUNNEL_LOW_SAMPLE_THRESHOLD,
  FUNNEL_STAGES,
  FunnelStage,
  computeFunnel,
  computeIntentCounts,
} from "@/lib/callFunnel";

/**
 * Mini-funnel de conversion "prise de RDV" pour une card centre de l'overview
 * admin. Rendu compact : 7 barres horizontales empilées, largeur = % du total,
 * dégradé neutre → teal → vert, badge orange sur la fuite principale.
 *
 * Cliquer sur la card parent doit rester la seule zone d'interaction :
 * ce composant n'a que des tooltips au survol (pas d'onClick).
 */

// Palette : dégradé neutre (haut de funnel) vers teal brand (milieu) puis
// vert succès sur "RDV pris". Une couleur = un stage, cohérent avec l'ordre.
const STAGE_COLORS: Record<FunnelStage, string> = {
  answered: "#cbd5e1",        // slate-300 — neutre, tout le monde arrive
  intent_captured: "#94a3b8",  // slate-400
  exam_identified: "#6b8ba7",  // bleu-gris
  slot_proposed: "#48C8AF",    // teal brand
  slot_accepted: "#3bb49d",    // teal brand -1
  identified: "#2fa091",       // teal brand -2
  booked: "#22c55e",           // vert succès
};

const DROP_ACCENT = "#f97316";       // orange 500 — la fuite principale
const DROP_ACCENT_BG = "#fff7ed";    // orange 50 — fond de la barre en fuite

type Props = {
  /** Liste d'appels bruts (avec `stats.funnel`) sur la période/centre. */
  calls: unknown[];
};

export default function FunnelMiniChart({ calls }: Props) {
  const funnel = computeFunnel(calls);
  const intentCounts = computeIntentCounts(calls);
  const hasAnnexCounts =
    intentCounts.modifications + intentCounts.annulations + intentCounts.confirmations > 0;

  // État vide — aucun appel prise_rdv sur la période
  if (!funnel) {
    return (
      <Box
        sx={{
          mt: 2,
          pt: 2,
          borderTop: "1px dashed #e5e7eb",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", fontSize: 10, letterSpacing: 0.5, mb: 0.5 }}
        >
          PARCOURS PRISE RDV
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: "italic" }}>
          Aucun appel de prise de RDV sur la période.
        </Typography>
        {hasAnnexCounts && (
          <AnnexCounts counts={intentCounts} sx={{ mt: 1 }} />
        )}
      </Box>
    );
  }

  const lowSample = funnel.total < FUNNEL_LOW_SAMPLE_THRESHOLD;
  const dropStage = funnel.biggestDrop?.stage;

  return (
    <Box
      sx={{
        mt: 2,
        pt: 2,
        borderTop: "1px dashed #e5e7eb",
        // Grisage global pour signaler un échantillon faible — les data
        // restent visibles mais avec un opacity réduit pour ne pas tromper.
        opacity: lowSample ? 0.5 : 1,
        transition: "opacity 250ms ease",
      }}
    >
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
          PARCOURS PRISE RDV
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
            {funnel.total} appel{funnel.total > 1 ? "s" : ""}
          </Typography>
        </Stack>
      </Box>

      {/* 7 barres */}
      <Stack spacing={0.5}>
        {FUNNEL_STAGES.map((stage, idx) => {
          const count = funnel.counts[stage];
          const percent = funnel.percents[stage];
          const isDropStage = dropStage === stage;
          const color = STAGE_COLORS[stage];
          const label = FUNNEL_LABELS[stage];

          // Chute par rapport à l'étape précédente (0 pour la première).
          const prevPercent = idx === 0 ? 100 : funnel.percents[FUNNEL_STAGES[idx - 1]];
          const dropFromPrev = idx === 0 ? 0 : prevPercent - percent;

          // La transition "Accueil → Intention" n'est pas une fuite (parcours
          // interrompu) mais un filtre de scope : on passe de "tous les
          // appels reçus" à "seulement ceux qui expriment une prise de RDV".
          // Message tooltip adapté pour éviter que le user croie que c'est
          // une chute problématique.
          const isScopeFilterStep = stage === "intent_captured";

          const tooltipTitle = (
            <Box sx={{ py: 0.25 }}>
              <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                {label}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", opacity: 0.85 }}>
                {count} appel{count > 1 ? "s" : ""} ({percent.toFixed(0)}%)
              </Typography>
              {isScopeFilterStep && dropFromPrev > 0 && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "#c7d2fe", mt: 0.25 }}
                >
                  Filtre : {dropFromPrev.toFixed(0)} pts des appels n&apos;étaient pas une prise de RDV
                </Typography>
              )}
              {idx > 0 && !isScopeFilterStep && dropFromPrev > 0 && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "#fdba74", mt: 0.25 }}
                >
                  Chute de {dropFromPrev.toFixed(0)} pts depuis {FUNNEL_LABELS[FUNNEL_STAGES[idx - 1]]}
                </Typography>
              )}
            </Box>
          );

          return (
            <MuiTooltip key={stage} title={tooltipTitle} arrow placement="left">
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  cursor: "default",
                  bgcolor: isDropStage ? DROP_ACCENT_BG : "transparent",
                  borderRadius: 0.5,
                  px: isDropStage ? 0.5 : 0,
                  py: isDropStage ? 0.25 : 0,
                  transition: "background-color 200ms ease",
                }}
              >
                {/* Label à gauche */}
                <Typography
                  variant="caption"
                  sx={{
                    width: 88,
                    fontSize: 10,
                    color: "text.secondary",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                  noWrap
                >
                  {label}
                </Typography>

                {/* Barre avec largeur = percent% */}
                <Box
                  sx={{
                    flex: 1,
                    height: 12,
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
                      // Animation d'entrée sur la largeur (staggered via delay)
                      animation: `funnelBarGrow 500ms ease-out ${idx * 60}ms both`,
                      transformOrigin: "left",
                      "@keyframes funnelBarGrow": {
                        from: { transform: "scaleX(0)" },
                        to: { transform: "scaleX(1)" },
                      },
                    }}
                  />
                </Box>

                {/* Valeur numérique (% + count entre parenthèses) */}
                <Typography
                  variant="caption"
                  sx={{
                    width: 62,
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
                    sx={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: "text.secondary",
                    }}
                  >
                    ({count})
                  </Typography>
                </Typography>

                {/* Badge fuite */}
                {isDropStage && funnel.biggestDrop && (
                  <Chip
                    size="small"
                    label={`−${funnel.biggestDrop.dropPct.toFixed(0)}%`}
                    sx={{
                      height: 16,
                      fontSize: 9,
                      fontWeight: 700,
                      bgcolor: DROP_ACCENT,
                      color: "#fff",
                      flexShrink: 0,
                      "& .MuiChip-label": { px: 0.75 },
                    }}
                  />
                )}
              </Box>
            </MuiTooltip>
          );
        })}
      </Stack>

      {/* Footer : conversion + fuite */}
      <Box
        sx={{
          mt: 1.5,
          pt: 1.25,
          borderTop: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, display: "block" }}
          >
            CONVERSION
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              lineHeight: 1,
              color: funnel.conversionRate >= 50 ? "#15803d" : funnel.conversionRate >= 25 ? "#92400e" : "#b91c1c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {funnel.conversionRate.toFixed(0)}%
          </Typography>
        </Box>

        {funnel.biggestDrop && (
          <Box sx={{ textAlign: "right", minWidth: 0, flex: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, display: "block" }}
            >
              PRINCIPALE FUITE
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontSize: 11, color: DROP_ACCENT, fontWeight: 700 }}
              noWrap
              title={`${FUNNEL_LABELS[funnel.biggestDrop.prevStage]} → ${FUNNEL_LABELS[funnel.biggestDrop.stage]}`}
            >
              {FUNNEL_LABELS[funnel.biggestDrop.stage]} (−{funnel.biggestDrop.dropPct.toFixed(0)}%)
            </Typography>
          </Box>
        )}
      </Box>

      {hasAnnexCounts && <AnnexCounts counts={intentCounts} sx={{ mt: 1 }} />}
    </Box>
  );
}

/**
 * Compteurs annexes pour les intents autres que prise_rdv, affichés sous le
 * funnel comme "3 modifs · 1 annulation · 2 confirmations". N'affiche qu'un
 * intent s'il a au moins 1 hit — sinon on masque pour ne pas surcharger.
 */
function AnnexCounts({
  counts,
  sx,
}: {
  counts: { modifications: number; annulations: number; confirmations: number };
  sx?: object;
}) {
  const parts: string[] = [];
  if (counts.modifications > 0) {
    parts.push(`${counts.modifications} modif${counts.modifications > 1 ? "s" : ""}`);
  }
  if (counts.annulations > 0) {
    parts.push(`${counts.annulations} annulation${counts.annulations > 1 ? "s" : ""}`);
  }
  if (counts.confirmations > 0) {
    parts.push(`${counts.confirmations} confirmation${counts.confirmations > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return null;

  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontSize: 10, display: "block", ...sx }}
    >
      + {parts.join(" · ")}
    </Typography>
  );
}

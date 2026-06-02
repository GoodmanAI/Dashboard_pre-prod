"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip as MuiTooltip,
  Typography,
} from "@mui/material";
import {
  IconId,
  IconRepeat,
  IconWorldWww,
  IconMicrophone,
  IconCalendarEvent,
  IconSettings,
  IconAlertTriangle,
  IconCheck,
  IconChartBar,
  IconClock,
  IconTimeline,
  IconBolt,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from "recharts";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePresets from "@/components/DateRangePresets";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import { useCentre } from "@/app/context/CentreContext";
import { startOfDay, endOfDay, subDays } from "date-fns";

// ---------- Types ----------
type TimeseriesPoint = {
  date: string;
  dayLabel: string;
  calls: number;
  identSuccessPct: number;
  avgDuration: number;
  azureAvgMs: number;
  ai2risAvgMs: number;
};

type EagerRecommendation = "activate" | "watch" | "skip" | "insufficient";

type EagerMetrics = {
  volume: number;
  eagerCount: number;
  resumedCount: number;
  fausseFinRatePct: number;
  gainAvgMs: number;
  gainMaxMs: number;
  gainTotalMs: number;
  gainExpectedMs: number;
  recommendation: EagerRecommendation;
};

type EagerByState = EagerMetrics & { state: string };

type AnalyticsInternal = {
  period: { from: string; to: string };
  totalCalls: number;
  callsWithInternal: number;
  timeseries: TimeseriesPoint[];
  eager: {
    global: EagerMetrics;
    byState: EagerByState[];
  };

  identification: {
    finalStatusDistribution: Record<string, number>;
    errorsByStep: Record<string, number>;
    avgTotalAttempts: number;
  };

  steps: {
    topRepeats: { state: string; count: number }[];
    topErrorsLogic: { state: string; count: number }[];
    topErrorsTimeout: { state: string; count: number }[];
    avgBargeIn: number;
    avgDurationMinutes: number;
    statesVisitedLengthDistribution: { bucket: string; count: number }[];
  };

  apiPerformance: {
    azureAvgMs: number;
    azureMaxMs: number;
    azureTotalCalls: number;
    ai2risAvgMs: number;
    ai2risMaxMs: number;
    ai2risTotalCalls: number;
    avgRetries: number;
    avgSlowCalls: number;
    timeoutsByEndpoint: { state: string; count: number }[];
  };

  stt: {
    avgFallbackRecognizing: number;
    avgTotalUtterances: number;
    languageDistribution: { language: string; count: number }[];
  };

  slot: {
    iterationsDistribution: { iterations: string; count: number }[];
    avgDispoExprimee: number;
    pctNoSlotsFlowTriggered: number;
    pctMultisiteQuestionAsked: number;
    pctMultisiteAccepted: number;
  };

  middlewares: {
    pctUrgence: number;
    pctHuman: number;
    pctMultiExam: number;
    pctEndConversation: number;
    avgRepeatIntent: number;
    avgRepeatSlowerIntent: number;
  };
};

// ---------- Composants utilitaires ----------

/** KPI compact : icône teal + label + valeur. */
function KpiCard({
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
function SectionCard({
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

/** BarChart simple horizontal-friendly. */
function MiniBarChart({
  data,
  dataKey,
  xKey,
  color = "#48C8AF",
  height = 220,
}: {
  data: any[];
  dataKey: string;
  xKey: string;
  color?: string;
  height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: "grid",
          placeItems: "center",
          border: "1px dashed #e5e7eb",
          borderRadius: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Aucune donnée
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <ReTooltip
            cursor={{ fill: "rgba(72,200,175,0.08)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid rgba(72,200,175,0.3)",
              fontSize: 12,
              padding: "6px 10px",
            }}
            labelStyle={{ fontWeight: 600, color: "#2a6f64" }}
          />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/** Bars segmentées + libellé/valeur — pour distributions à plusieurs catégories. */
function DistributionBars({
  data,
  total,
  colors,
}: {
  data: { label: string; count: number; key: string }[];
  total: number;
  colors: Record<string, string>;
}) {
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        Aucune donnée
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      {data.map((d) => {
        const pct = total > 0 ? (d.count / total) * 100 : 0;
        const color = colors[d.key] ?? "#48C8AF";
        return (
          <Box key={d.key}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>
                {d.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {d.count} ({Math.round(pct * 10) / 10}%)
              </Typography>
            </Box>
            <Box
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: "rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: `${pct}%`,
                  height: "100%",
                  bgcolor: color,
                  borderRadius: 4,
                  transition: "width 400ms ease",
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

// ---------- Eager (EagerEndOfTurn) ----------

/** Formate des millisecondes en libellé court ("250ms", "1.2s", "2min 30s"). */
function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const s = ms / 1000;
    return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
  }
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min}min` : `${min}min ${sec}s`;
}

const RECO_META: Record<
  EagerRecommendation,
  { label: string; color: string; bg: string }
> = {
  activate: { label: "Activer", color: "#15803d", bg: "rgba(34,197,94,0.18)" },
  watch: { label: "À surveiller", color: "#92400e", bg: "rgba(245,158,11,0.18)" },
  skip: { label: "Ne pas activer", color: "#b91c1c", bg: "rgba(239,68,68,0.18)" },
  insufficient: {
    label: "Volume insuffisant",
    color: "#4b5563",
    bg: "rgba(156,163,175,0.2)",
  },
};

function RecommendationChip({ reco }: { reco: EagerRecommendation }) {
  const meta = RECO_META[reco];
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{
        height: 22,
        bgcolor: meta.bg,
        color: meta.color,
        fontWeight: 700,
        fontSize: 11,
      }}
    />
  );
}

/** Tooltip personnalisé pour le scatter bénéfice vs risque. */
function ScatterTooltip(props: any) {
  if (!props?.active || !props?.payload?.length) return null;
  const d = props.payload[0].payload as EagerByState;
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid rgba(72,200,175,0.4)",
        borderRadius: 1,
        p: 1.2,
        fontSize: 12,
        boxShadow: 2,
        minWidth: 180,
      }}
    >
      <Typography variant="caption" fontWeight={800} sx={{ display: "block", color: "#2a6f64" }}>
        {d.state}
      </Typography>
      <Box sx={{ mt: 0.5, display: "grid", gap: 0.25, gridTemplateColumns: "auto auto" }}>
        <Typography variant="caption" color="text.secondary">Volume</Typography>
        <Typography variant="caption" fontWeight={600} sx={{ textAlign: "right" }}>{d.volume}</Typography>
        <Typography variant="caption" color="text.secondary">Fausses fins</Typography>
        <Typography variant="caption" fontWeight={600} sx={{ textAlign: "right" }}>{d.fausseFinRatePct}%</Typography>
        <Typography variant="caption" color="text.secondary">Gain moyen</Typography>
        <Typography variant="caption" fontWeight={600} sx={{ textAlign: "right" }}>{formatMs(d.gainAvgMs)}</Typography>
        <Typography variant="caption" color="text.secondary">Gain total potentiel</Typography>
        <Typography variant="caption" fontWeight={600} sx={{ textAlign: "right", color: "#2a6f64" }}>{formatMs(d.gainTotalMs)}</Typography>
      </Box>
      <Box sx={{ mt: 0.75 }}>
        <RecommendationChip reco={d.recommendation} />
      </Box>
    </Box>
  );
}

function EagerSection({ eager }: { eager: AnalyticsInternal["eager"] }) {
  const { global, byState } = eager;

  // Couleur des points du scatter selon la recommandation.
  const dotColor = (reco: EagerRecommendation) =>
    reco === "activate"
      ? "#22c55e"
      : reco === "watch"
      ? "#f59e0b"
      : reco === "skip"
      ? "#ef4444"
      : "#9ca3af";

  // Top 10 étapes par gain total pour le bar chart.
  const topByGain = byState.slice(0, 10);

  // Si aucun event Eager sur la période : empty state.
  const hasAnyData = global.volume > 0;

  return (
    <Card elevation={1} sx={{ p: { xs: 2.5, md: 3 }, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
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
          <IconBolt size={22} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            Évaluation EagerEndOfTurn
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gain potentiel d&apos;un déclenchement spéculatif du pipeline NLP+TTS
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          mb: 2.5,
          px: 1.5,
          py: 1,
          borderRadius: 1,
          bgcolor: "rgba(72,200,175,0.05)",
          border: "1px dashed rgba(72,200,175,0.3)",
        }}
      >
        <IconInfoCircle size={16} color="#2a6f64" style={{ flexShrink: 0, marginTop: 2 }} />
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          Le <strong>gain moyen</strong> est un <em>plafond</em> par tour — le gain net réel
          dépend du temps de démarrage du pipeline NLP+TTS. Les fausses fins (TurnResumed)
          ne rapportent rien et sont déjà déduites dans le <em>gain attendu / event</em>.
        </Typography>
      </Box>

      <Divider sx={{ mb: 2.5 }} />

      {!hasAnyData ? (
        <Box
          sx={{
            py: 6,
            display: "grid",
            placeItems: "center",
            border: "1px dashed #e5e7eb",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Aucun event Eager collecté sur la période.
          </Typography>
        </Box>
      ) : (
        <>
          {/* ---------- KPI globaux ---------- */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <KpiCard
                label="Volume total"
                value={global.volume}
                icon={<IconBolt size={20} />}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <KpiCard
                label="Eager confirmés"
                value={global.eagerCount}
                icon={<IconCheck size={20} />}
                valueColor="#22c55e"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <KpiCard
                label="Fausses fins"
                value={`${global.resumedCount} (${global.fausseFinRatePct}%)`}
                icon={<IconAlertTriangle size={20} />}
                valueColor={
                  global.fausseFinRatePct > 25
                    ? "#ef4444"
                    : global.fausseFinRatePct > 15
                    ? "#f59e0b"
                    : "#22c55e"
                }
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <KpiCard
                label="Gain total potentiel"
                value={formatMs(global.gainTotalMs)}
                icon={<IconClock size={20} />}
                valueColor="#2a6f64"
              />
            </Grid>
            <Grid item xs={6} md={4}>
              <KpiCard
                label="Gain moyen / tour confirmé"
                value={formatMs(global.gainAvgMs)}
                icon={<IconTimeline size={20} />}
              />
            </Grid>
            <Grid item xs={6} md={4}>
              <KpiCard
                label="Gain max observé"
                value={formatMs(global.gainMaxMs)}
                icon={<IconChartBar size={20} />}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <KpiCard
                label="Gain attendu pondéré / event"
                value={formatMs(global.gainExpectedMs)}
                icon={<IconBolt size={20} />}
                valueColor="#4899B5"
              />
            </Grid>
          </Grid>

          {/* ---------- Scatter "Bénéfice vs Risque" + Bar top étapes ---------- */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
              >
                BÉNÉFICE VS RISQUE PAR ÉTAPE
              </Typography>
              <Box sx={{ height: 280, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 16, right: 20, bottom: 36, left: 8 }}>
                    <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="fausseFinRatePct"
                      name="Taux fausses fins"
                      unit="%"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={false}
                      domain={[0, "auto"]}
                      label={{
                        value: "Taux fausses fins (%)",
                        position: "insideBottom",
                        offset: -8,
                        style: { fontSize: 11, fill: "#6b7280" },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="gainAvgMs"
                      name="Gain moyen"
                      unit="ms"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: "Gain moyen (ms)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 12,
                        style: { fontSize: 11, fill: "#6b7280" },
                      }}
                    />
                    <ZAxis
                      type="number"
                      dataKey="volume"
                      range={[60, 500]}
                      name="Volume"
                    />
                    <ReferenceLine
                      x={15}
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine
                      y={250}
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                    <ReTooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={byState}>
                      {byState.map((d, i) => (
                        <Cell key={i} fill={dotColor(d.recommendation)} fillOpacity={0.75} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
                {(["activate", "watch", "skip", "insufficient"] as EagerRecommendation[]).map(
                  (r) => (
                    <Box key={r} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: dotColor(r),
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {RECO_META[r].label}
                      </Typography>
                    </Box>
                  )
                )}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
              >
                TOP ÉTAPES PAR GAIN TOTAL POTENTIEL
              </Typography>
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topByGain}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={false}
                      tickFormatter={(v: number) => formatMs(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="state"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      width={130}
                    />
                    <ReTooltip
                      cursor={{ fill: "rgba(72,200,175,0.08)" }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid rgba(72,200,175,0.3)",
                        fontSize: 12,
                        padding: "6px 10px",
                      }}
                      labelStyle={{ fontWeight: 600, color: "#2a6f64" }}
                      formatter={(value: any) => [formatMs(Number(value)), "Gain total"]}
                    />
                    <Bar dataKey="gainTotalMs" radius={[0, 4, 4, 0]}>
                      {topByGain.map((d, i) => (
                        <Cell key={i} fill={dotColor(d.recommendation)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Grid>
          </Grid>

          {/* ---------- Tableau détaillé ---------- */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
          >
            DÉTAIL PAR ÉTAPE (TRIÉ PAR GAIN TOTAL ↓)
          </Typography>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: "1px solid #f3f4f6", maxHeight: 420 }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Étape</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Volume
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Eager
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Fausses fins
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Taux faux
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Gain moy.
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Gain max
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Gain total
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>
                    <MuiTooltip title="Gain moyen × (1 − taux fausses fins). Pondéré par le risque que l'Eager soit une fausse fin.">
                      <span>Gain attendu / event</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11 }}>
                    Reco
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {byState.map((s) => (
                  <TableRow key={s.state} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{s.state}</TableCell>
                    <TableCell align="right">{s.volume}</TableCell>
                    <TableCell align="right">{s.eagerCount}</TableCell>
                    <TableCell align="right">{s.resumedCount}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color:
                          s.fausseFinRatePct > 25
                            ? "#ef4444"
                            : s.fausseFinRatePct > 15
                            ? "#f59e0b"
                            : "#22c55e",
                        fontWeight: 600,
                      }}
                    >
                      {s.fausseFinRatePct}%
                    </TableCell>
                    <TableCell align="right">{formatMs(s.gainAvgMs)}</TableCell>
                    <TableCell align="right">{formatMs(s.gainMaxMs)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: "#2a6f64" }}>
                      {formatMs(s.gainTotalMs)}
                    </TableCell>
                    <TableCell align="right">{formatMs(s.gainExpectedMs)}</TableCell>
                    <TableCell align="center">
                      <RecommendationChip reco={s.recommendation} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Card>
  );
}

// ---------- Timeseries ----------

/**
 * Convertit un nombre décimal de minutes (ex: 1.78) en libellé lisible
 * "Xmin Ys" (ex: "1min 47s"). Gère le rollover quand Math.round arrondit à 60s.
 */
function formatMinutes(decimalMinutes: number): string {
  if (!Number.isFinite(decimalMinutes) || decimalMinutes <= 0) return "0s";
  let mins = Math.floor(decimalMinutes);
  let secs = Math.round((decimalMinutes - mins) * 60);
  if (secs === 60) {
    mins += 1;
    secs = 0;
  }
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}min`;
  return `${mins}min ${secs}s`;
}

type MetricKey =
  | "calls"
  | "identSuccessPct"
  | "avgDuration"
  | "azureAvgMs"
  | "ai2risAvgMs";

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  unit: string;
  formatter?: (v: number) => string;
}[] = [
  { key: "calls", label: "Appels", color: "#48C8AF", unit: "" },
  { key: "identSuccessPct", label: "Identification réussie", color: "#22c55e", unit: "%" },
  { key: "avgDuration", label: "Durée moy.", color: "#4899B5", unit: "", formatter: formatMinutes },
  { key: "azureAvgMs", label: "Latence Azure", color: "#f59e0b", unit: "ms" },
  { key: "ai2risAvgMs", label: "Latence AI2RIS", color: "#a855f7", unit: "ms" },
];

/** Carte d'évolution temporelle : Tabs pour choisir la métrique + LineChart. */
function TimeseriesCard({ timeseries }: { timeseries: TimeseriesPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("calls");
  const current = METRICS.find((m) => m.key === metric)!;

  // On considère qu'il y a des données dès qu'il y a au moins un appel sur la
  // période. On affiche la courbe même si la métrique courante est à 0 partout
  // — l'utilisateur voit ainsi une ligne plate à 0 explicite plutôt qu'un
  // message d'erreur trompeur (cas typique : métrique non encore peuplée par
  // le bot, ou aucun appel n'a déclenché cette feature).
  const hasAnyCalls = timeseries.some((p) => p.calls > 0);
  const isMetricEmpty = !timeseries.some(
    (p) => (p[metric as keyof TimeseriesPoint] as number) > 0
  );

  return (
    <Card elevation={1} sx={{ p: { xs: 2.5, md: 3 }, mb: 3 }}>
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
          <IconTimeline size={22} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            Évolution temporelle
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Tendance par jour sur la période sélectionnée
          </Typography>
        </Box>
      </Box>

      <Tabs
        value={metric}
        onChange={(_, v) => setMetric(v as MetricKey)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 600,
            fontSize: 13,
            minHeight: 40,
          },
          "& .Mui-selected": { color: `${current.color} !important` },
          "& .MuiTabs-indicator": { backgroundColor: current.color },
        }}
      >
        {METRICS.map((m) => (
          <Tab key={m.key} value={m.key} label={m.label} />
        ))}
      </Tabs>

      {!hasAnyCalls ? (
        <Box
          sx={{
            height: 260,
            display: "grid",
            placeItems: "center",
            border: "1px dashed #e5e7eb",
            borderRadius: 2,
            px: 3,
            textAlign: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Aucun appel sur la période.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ height: 260, position: "relative" }}>
          {isMetricEmpty && (
            <Box
              sx={{
                position: "absolute",
                top: 4,
                right: 8,
                zIndex: 2,
                bgcolor: "rgba(156,163,175,0.12)",
                color: "#6b7280",
                px: 1,
                py: 0.25,
                borderRadius: 1,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              Métrique vide sur la période
            </Box>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={current.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={current.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  current.formatter ? current.formatter(v) : String(v)
                }
              />
              <ReTooltip
                cursor={{ stroke: current.color, strokeDasharray: "3 3" }}
                contentStyle={{
                  borderRadius: 8,
                  border: `1px solid ${current.color}55`,
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                labelStyle={{ fontWeight: 600, color: "#2a6f64" }}
                formatter={(value: any) => {
                  const v = Number(value);
                  const formatted = current.formatter ? current.formatter(v) : String(v);
                  return [`${formatted}${current.unit ? " " + current.unit : ""}`, current.label];
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={current.color}
                strokeWidth={2.5}
                fill={`url(#grad-${metric})`}
                dot={{ r: 3, fill: current.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Card>
  );
}

// ---------- Page ----------
const AnalyticsInternalPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { allCentres } = useCentre();

  // Filtres
  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  });
  // Liste des userProductId sélectionnés ; [] = "tous les centres"
  const [selectedUserProductIds, setSelectedUserProductIds] = useState<number[]>([]);
  const [rdvStatus, setRdvStatus] = useState<string>("all");
  const [showPicker, setShowPicker] = useState(false);

  // Data
  const [data, setData] = useState<AnalyticsInternal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
    else if (session && session.user.role !== "ADMIN") router.push("/client");
  }, [session, status, router]);

  // Fetch
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("from", range.from.toISOString());
        params.set("to", range.to.toISOString());
        if (selectedUserProductIds.length > 0) {
          params.set("userProductIds", selectedUserProductIds.join(","));
        }
        if (rdvStatus !== "all") params.set("rdv_status", rdvStatus);
        const res = await fetch(`/api/admin/analytics-internal?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnalyticsInternal;
        setData(json);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [range, selectedUserProductIds, rdvStatus]);

  // Centres triés alphabétiquement
  const centreOptions = useMemo(
    () =>
      [...allCentres].sort((a, b) =>
        (a.name || a.email).localeCompare(b.name || b.email)
      ),
    [allCentres]
  );

  // ---------- Préparations dérivées ----------
  const identificationBars = useMemo(() => {
    if (!data) return [];
    const d = data.identification.finalStatusDistribution;
    return [
      { key: "success", label: "Succès", count: d.success ?? 0 },
      { key: "failed_transfer", label: "Transfert échec", count: d.failed_transfer ?? 0 },
      { key: "new_patient", label: "Nouveau patient", count: d.new_patient ?? 0 },
      { key: "null_or_other", label: "Autre / null", count: d.null_or_other ?? 0 },
    ];
  }, [data]);

  const identificationColors: Record<string, string> = {
    success: "#48C8AF",
    failed_transfer: "#ef4444",
    new_patient: "#4899B5",
    null_or_other: "#9ca3af",
  };

  const errorsByStepData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.identification.errorsByStep).map(([state, count]) => ({
      state,
      count,
    }));
  }, [data]);

  if (status === "loading") {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContainer
      title="Statistiques produit"
      description="Agrégats des indicateurs internes du bot Lyrae"
    >
      <Box>
        <SectionHeader
          title="Statistiques produit"
          subtitle="Indicateurs internes du bot Lyrae — agrégés sur tous les centres"
          actions={
            loading ? <Chip size="small" label="chargement…" variant="outlined" /> : undefined
          }
        />

        {/* ---------- Filtres ---------- */}
        <Card elevation={1} sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", lg: "center" }}
            justifyContent="space-between"
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Période
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                <DateRangePresets range={range} onChange={setRange} />
                <Chip
                  size="small"
                  label={
                    showPicker
                      ? "Masquer le calendrier"
                      : `${range.from.toLocaleDateString("fr-FR")} → ${range.to.toLocaleDateString("fr-FR")}`
                  }
                  variant="outlined"
                  onClick={() => setShowPicker((p) => !p)}
                  sx={{
                    cursor: "pointer",
                    fontWeight: 600,
                    border: "1px solid rgba(72,200,175,0.3)",
                    color: "#2a6f64",
                  }}
                />
              </Stack>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 260, maxWidth: 420 }}>
                <InputLabel id="centre-select">Centres</InputLabel>
                <Select
                  labelId="centre-select"
                  multiple
                  value={selectedUserProductIds}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedUserProductIds(
                      typeof v === "string"
                        ? v.split(",").map(Number).filter(Number.isFinite)
                        : (v as number[])
                    );
                  }}
                  input={<OutlinedInput label="Centres" />}
                  renderValue={(selected) => {
                    if (!selected || selected.length === 0) return "Tous les centres";
                    if (selected.length <= 2) {
                      return (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {selected.map((id) => {
                            const c = centreOptions.find((x) => x.userProductId === id);
                            return (
                              <Chip
                                key={id}
                                size="small"
                                label={c?.name || c?.email || `#${id}`}
                                sx={{
                                  height: 22,
                                  bgcolor: "rgba(72,200,175,0.15)",
                                  color: "#2a6f64",
                                  fontWeight: 600,
                                }}
                              />
                            );
                          })}
                        </Box>
                      );
                    }
                    return `${selected.length} centres sélectionnés`;
                  }}
                  MenuProps={{
                    PaperProps: { sx: { maxHeight: 360 } },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      borderBottom: "1px solid #f3f4f6",
                      position: "sticky",
                      top: 0,
                      bgcolor: "background.paper",
                      zIndex: 1,
                    }}
                  >
                    <Button
                      size="small"
                      onClick={() =>
                        setSelectedUserProductIds(centreOptions.map((c) => c.userProductId))
                      }
                      sx={{ textTransform: "none", color: "#2a6f64" }}
                    >
                      Tout sélectionner
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setSelectedUserProductIds([])}
                      sx={{ textTransform: "none", color: "#6b7280" }}
                    >
                      Effacer
                    </Button>
                  </Box>
                  {centreOptions.map((c) => (
                    <MenuItem key={c.userProductId} value={c.userProductId}>
                      <Checkbox
                        checked={selectedUserProductIds.includes(c.userProductId)}
                        sx={{ color: "#48C8AF", "&.Mui-checked": { color: "#48C8AF" } }}
                      />
                      <ListItemText primary={c.name || c.email} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="rdv-select">Statut RDV</InputLabel>
                <Select
                  labelId="rdv-select"
                  label="Statut RDV"
                  value={rdvStatus}
                  onChange={(e) => setRdvStatus(String(e.target.value))}
                >
                  <MenuItem value="all">Tous</MenuItem>
                  <MenuItem value="success">Succès</MenuItem>
                  <MenuItem value="no_slot">Pas de créneau</MenuItem>
                  <MenuItem value="not_performed">Non traité</MenuItem>
                  <MenuItem value="transferred">Transféré</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>

          {showPicker && (
            <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
              <DateRangePicker value={range} onChange={setRange} />
            </Box>
          )}
        </Card>

        {/* ---------- Header : nb d'appels analysés ---------- */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}>
            <KpiCard
              label="Appels sur la période"
              value={data ? data.totalCalls : "—"}
              icon={<IconChartBar size={20} />}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <KpiCard
              label="Avec stats internes"
              value={data ? data.callsWithInternal : "—"}
              icon={<IconCheck size={20} />}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <KpiCard
              label="Durée moyenne"
              value={data ? formatMinutes(data.steps.avgDurationMinutes) : "—"}
              icon={<IconClock size={20} />}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <KpiCard
              label="Barge-in moyen"
              value={data ? data.steps.avgBargeIn : "—"}
              icon={<IconAlertTriangle size={20} />}
            />
          </Grid>
        </Grid>

        {error && (
          <Card elevation={1} sx={{ p: 3, mb: 3, bgcolor: "rgba(239,68,68,0.05)" }}>
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          </Card>
        )}

        {/* ---------- Évolution temporelle ---------- */}
        {data && data.timeseries?.length > 0 && (
          <TimeseriesCard timeseries={data.timeseries} />
        )}

        {/* ---------- Évaluation EagerEndOfTurn ---------- */}
        {data?.eager && <EagerSection eager={data.eager} />}

        {loading && !data ? (
          <Box
            sx={{
              columnCount: { xs: 1, md: 2 },
              columnGap: "24px",
              "& > *": {
                breakInside: "avoid",
                WebkitColumnBreakInside: "avoid",
                display: "block",
                mb: 3,
              },
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Card key={i} elevation={1} sx={{ p: 3 }}>
                <Skeleton variant="text" width="40%" height={28} />
                <Skeleton variant="rounded" height={200} sx={{ mt: 2 }} />
              </Card>
            ))}
          </Box>
        ) : data ? (
          // Masonry CSS natif : 2 colonnes sur desktop, 1 sur mobile.
          // `breakInside: avoid` empêche une section d'être coupée entre 2 colonnes,
          // et le browser balance automatiquement la hauteur — fini les espaces vides
          // sous une section plus courte que sa voisine.
          <Box
            sx={{
              columnCount: { xs: 1, md: 2 },
              columnGap: "24px",
              "& > *": {
                breakInside: "avoid",
                WebkitColumnBreakInside: "avoid",
                pageBreakInside: "avoid",
                display: "block",
                mb: 3,
              },
            }}
          >
            {/* ---------- 1. Identification ---------- */}
            <Box>
              <SectionCard
                title="Identification"
                subtitle="Statut final et erreurs durant l'identification"
                icon={<IconId size={22} />}
              >
                <Stack spacing={3}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      DISTRIBUTION DU STATUT FINAL
                    </Typography>
                    <DistributionBars
                      data={identificationBars}
                      total={data.callsWithInternal}
                      colors={identificationColors}
                    />
                  </Box>

                  <Divider />

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      ERREURS PAR ÉTAPE (TOTAL)
                    </Typography>
                    <MiniBarChart
                      data={errorsByStepData}
                      dataKey="count"
                      xKey="state"
                      height={180}
                      color="#ef4444"
                    />
                  </Box>

                  <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                    <KpiCard
                      label="Tentatives moy."
                      value={data.identification.avgTotalAttempts}
                      icon={<IconRepeat size={20} />}
                    />
                  </Stack>
                </Stack>
              </SectionCard>
            </Box>

            {/* ---------- 2. Steps (qualité par étape) ---------- */}
            <Box>
              <SectionCard
                title="Qualité par étape"
                subtitle="Top états : répétitions, erreurs logiques et timeouts"
                icon={<IconRepeat size={22} />}
              >
                <Stack spacing={3}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      TOP RÉPÉTITIONS PAR ÉTAT
                    </Typography>
                    <MiniBarChart
                      data={data.steps.topRepeats}
                      dataKey="count"
                      xKey="state"
                      height={180}
                      color="#48C8AF"
                    />
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      TOP ERREURS LOGIQUES
                    </Typography>
                    <MiniBarChart
                      data={data.steps.topErrorsLogic}
                      dataKey="count"
                      xKey="state"
                      height={180}
                      color="#ef4444"
                    />
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      TOP TIMEOUTS PAR ÉTAT
                    </Typography>
                    <MiniBarChart
                      data={data.steps.topErrorsTimeout}
                      dataKey="count"
                      xKey="state"
                      height={180}
                      color="#f59e0b"
                    />
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      LONGUEUR DU PARCOURS (NB ÉTATS VISITÉS)
                    </Typography>
                    <MiniBarChart
                      data={data.steps.statesVisitedLengthDistribution}
                      dataKey="count"
                      xKey="bucket"
                      height={160}
                      color="#4899B5"
                    />
                  </Box>
                </Stack>
              </SectionCard>
            </Box>

            {/* ---------- 3. API performance ---------- */}
            <Box>
              <SectionCard
                title="Performance API"
                subtitle="Latence Azure / AI2RIS, retries, timeouts"
                icon={<IconWorldWww size={22} />}
              >
                <Stack spacing={3}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      AZURE
                    </Typography>
                    <Grid container spacing={1.5}>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Moy."
                          value={data.apiPerformance.azureAvgMs}
                          suffix="ms"
                          icon={<IconClock size={18} />}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Max"
                          value={data.apiPerformance.azureMaxMs}
                          suffix="ms"
                          icon={<IconAlertTriangle size={18} />}
                          valueColor={
                            data.apiPerformance.azureMaxMs > 5000 ? "#ef4444" : undefined
                          }
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Total appels"
                          value={data.apiPerformance.azureTotalCalls}
                          icon={<IconChartBar size={18} />}
                        />
                      </Grid>
                    </Grid>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      AI2RIS
                    </Typography>
                    <Grid container spacing={1.5}>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Moy."
                          value={data.apiPerformance.ai2risAvgMs}
                          suffix="ms"
                          icon={<IconClock size={18} />}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Max"
                          value={data.apiPerformance.ai2risMaxMs}
                          suffix="ms"
                          icon={<IconAlertTriangle size={18} />}
                          valueColor={
                            data.apiPerformance.ai2risMaxMs > 5000 ? "#ef4444" : undefined
                          }
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <KpiCard
                          label="Total appels"
                          value={data.apiPerformance.ai2risTotalCalls}
                          icon={<IconChartBar size={18} />}
                        />
                      </Grid>
                    </Grid>
                  </Box>

                  <Divider />

                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Retries moy."
                        value={data.apiPerformance.avgRetries}
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Slow calls moy."
                        value={data.apiPerformance.avgSlowCalls}
                        icon={<IconClock size={18} />}
                      />
                    </Grid>
                  </Grid>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      TIMEOUTS PAR ENDPOINT
                    </Typography>
                    <MiniBarChart
                      data={data.apiPerformance.timeoutsByEndpoint}
                      dataKey="count"
                      xKey="state"
                      height={180}
                      color="#ef4444"
                    />
                  </Box>
                </Stack>
              </SectionCard>
            </Box>

            {/* ---------- 4. STT ---------- */}
            <Box>
              <SectionCard
                title="STT (Speech-to-Text)"
                subtitle="Confiance, fallback et langues détectées"
                icon={<IconMicrophone size={22} />}
              >
                <Stack spacing={3}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Utterances moy."
                        value={data.stt.avgTotalUtterances}
                        icon={<IconMicrophone size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Fallback moy."
                        value={data.stt.avgFallbackRecognizing}
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                  </Grid>

                  <Divider />

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      LANGUE DÉTECTÉE
                    </Typography>
                    <MiniBarChart
                      data={data.stt.languageDistribution}
                      dataKey="count"
                      xKey="language"
                      height={180}
                      color="#4899B5"
                    />
                  </Box>
                </Stack>
              </SectionCard>
            </Box>

            {/* ---------- 5. Slot ---------- */}
            <Box>
              <SectionCard
                title="Slot (créneaux)"
                subtitle="Itérations, multisite et déclenchements"
                icon={<IconCalendarEvent size={22} />}
              >
                <Stack spacing={3}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5, mb: 1, display: "block" }}
                    >
                      ITÉRATIONS AVANT ACCEPTATION
                    </Typography>
                    <Box sx={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.slot.iterationsDistribution}>
                          <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="iterations"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={{ stroke: "#e5e7eb" }}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <ReTooltip
                            cursor={{ fill: "rgba(72,200,175,0.08)" }}
                            contentStyle={{
                              borderRadius: 8,
                              border: "1px solid rgba(72,200,175,0.3)",
                              fontSize: 12,
                              padding: "6px 10px",
                            }}
                            labelStyle={{ fontWeight: 600, color: "#2a6f64" }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {data.slot.iterationsDistribution.map((d, i) => {
                              const colors = ["#22c55e", "#48C8AF", "#f59e0b", "#ef4444"];
                              return <Cell key={i} fill={colors[i] ?? "#48C8AF"} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>

                  <Divider />

                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Dispo exprimées moy."
                        value={data.slot.avgDispoExprimee}
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="No-slots déclenchés"
                        value={data.slot.pctNoSlotsFlowTriggered}
                        suffix="%"
                        icon={<IconAlertTriangle size={18} />}
                        valueColor={
                          data.slot.pctNoSlotsFlowTriggered > 20 ? "#ef4444" : undefined
                        }
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Multisite proposé"
                        value={data.slot.pctMultisiteQuestionAsked}
                        suffix="%"
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Multisite accepté"
                        value={data.slot.pctMultisiteAccepted}
                        suffix="%"
                        icon={<IconCheck size={18} />}
                        valueColor="#22c55e"
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </SectionCard>
            </Box>

            {/* ---------- 6. Middlewares ---------- */}
            <Box>
              <SectionCard
                title="Middlewares"
                subtitle="Détections d'intentions et déclencheurs"
                icon={<IconSettings size={22} />}
              >
                <Stack spacing={3}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Urgence détectée"
                        value={data.middlewares.pctUrgence}
                        suffix="%"
                        icon={<IconAlertTriangle size={18} />}
                        valueColor={
                          data.middlewares.pctUrgence > 5 ? "#ef4444" : undefined
                        }
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Demande humaine"
                        value={data.middlewares.pctHuman}
                        suffix="%"
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Multi-exam"
                        value={data.middlewares.pctMultiExam}
                        suffix="%"
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Fin de conv. déclenchée"
                        value={data.middlewares.pctEndConversation}
                        suffix="%"
                        icon={<IconCheck size={18} />}
                      />
                    </Grid>
                  </Grid>

                  <Divider />

                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Demandes de répétition (moy.)"
                        value={data.middlewares.avgRepeatIntent}
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <KpiCard
                        label="Demandes de ralentissement (moy.)"
                        value={data.middlewares.avgRepeatSlowerIntent}
                        icon={<IconRepeat size={18} />}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </SectionCard>
            </Box>
          </Box>
        ) : null}
      </Box>
    </PageContainer>
  );
};

export default AnalyticsInternalPage;

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  IconCalendarOff,
  IconClock,
  IconHash,
  IconAlertTriangle,
  IconArrowRight,
  IconPhoneOff,
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
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  startOfMonth,
  format,
  differenceInCalendarDays,
} from "date-fns";
import { fr } from "date-fns/locale";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePresets from "@/components/DateRangePresets";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

// ---------- Types ----------
type AggregateItem = {
  examCode: string;
  /** Libellé déjà résolu côté serveur via TalkSettings.exams (sinon = examCode). */
  label: string;
  count: number;
  lastCallAt: string;
  lastCallId: number;
};

type AggregateResponse = {
  period: { from: string; to: string };
  total: number;
  rdvStatusDistribution: Record<string, number>;
  confirmed: { total: number; items: AggregateItem[] };
  toInvestigate: { total: number; items: AggregateItem[] };
  timeseries: { date: string; dayLabel: string; confirmed: number; toInvestigate: number }[];
  /** Distribution globale par modalité (confirmed + toInvestigate confondus). */
  typeDistribution: Record<string, number>;
  /** Timeseries par jour, un champ par type — pour le multi-line chart. */
  typeTimeseries: Array<Record<string, number | string>>;
  /** Liste des types présents (ordonnée logiquement RX / US / MG / CT / MR + …). */
  typeKeys: string[];
};

// ---------- Examens non pris en charge ----------

type ExamNonPrisCodeItem = {
  examCode: string;
  label: string;
  type: string | null;
  count: number;
  lastCallAt: string;
  lastCallId: number;
};

type ExamNonPrisTypeItem = {
  type: string;
  count: number;
  lastCallAt: string;
  lastCallId: number;
};

type ExamNonPrisResponse = {
  period: { from: string; to: string };
  total: number;
  codes: { total: number; items: ExamNonPrisCodeItem[] };
  bookableTypes: { total: number; items: ExamNonPrisTypeItem[] };
  typeDistribution: Record<string, number>;
  timeseries: { date: string; dayLabel: string; codes: number; types: number }[];
};

// ---------- Helpers ----------
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `${date} · ${time}`;
}

/**
 * Wrapper de liste de cards scrollable. Limite la hauteur visible à ~ 5-6
 * cards pour ne pas faire une page à rallonge ; au-delà l'utilisateur scrolle
 * dans la zone.
 */
function ScrollableCardList({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        maxHeight: 520,
        overflowY: "auto",
        pr: 0.5,
        // Scrollbar discrète, teal sur hover.
        "&::-webkit-scrollbar": { width: 6 },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": {
          background: "rgba(0,0,0,0.12)",
          borderRadius: 3,
        },
        "&::-webkit-scrollbar-thumb:hover": { background: "rgba(72,200,175,0.4)" },
      }}
    >
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

const RDV_STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  full_planning_redirect: {
    label: "Patient redirigé vers le secrétariat",
    color: "#48C8AF",
    icon: <IconArrowRight size={18} />,
  },
  full_planning_end: {
    label: "Fin d'appel avec message",
    color: "#4899B5",
    icon: <IconPhoneOff size={18} />,
  },
  no_slot: {
    label: "Aucun créneau (cas ambigu)",
    color: "#f59e0b",
    icon: <IconAlertTriangle size={18} />,
  },
};

// ---------- Composants internes ----------

/** Card examen (fine, esthétique) — utilisée pour les 2 catégories avec accent variable. */
function ExamCard({
  item,
  label,
  pct,
  accent,
  accentLight,
  accentText,
}: {
  item: AggregateItem;
  label: string;
  pct: number;
  accent: string;
  accentLight: string;
  accentText: string;
}) {
  return (
    <Card
      elevation={1}
      sx={{
        p: 2,
        position: "relative",
        overflow: "hidden",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: `0 6px 18px ${accentLight}`,
        },
      }}
    >
      {/* Barre de proportion en arrière-plan */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          bgcolor: accentLight,
          transition: "width 400ms ease",
        }}
      />

      <Stack direction="row" spacing={2} alignItems="center" sx={{ position: "relative" }}>
        <Box
          sx={{
            minWidth: 56,
            height: 56,
            px: 1.5,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            bgcolor: "#fff",
            border: `2px solid ${accent}`,
            color: accentText,
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>
            {item.examCode === "__unknown__" ? "?" : item.examCode}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {label}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            <IconClock size={14} color="#6b7280" />
            <Typography variant="caption" color="text.secondary">
              Dernier : {formatDateTime(item.lastCallAt)}
            </Typography>
          </Stack>
        </Box>

        <Box
          sx={{
            minWidth: 64,
            height: 56,
            px: 1.5,
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: accent,
            color: accentText,
            flexShrink: 0,
          }}
        >
          <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>
            {item.count}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.7, lineHeight: 1, mt: 0.25 }}>
            appel{item.count > 1 ? "s" : ""}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}

// ---------- Modalité : palette + helpers ----------

/** Couleurs cohérentes par modalité d'examen. */
const TYPE_COLORS: Record<string, string> = {
  RX: "#48C8AF",
  US: "#4899B5",
  MG: "#f59e0b",
  CT: "#a855f7",
  MR: "#ef4444",
  unknown: "#9ca3af",
};

const TYPE_LABELS: Record<string, string> = {
  RX: "Radiologie",
  US: "Échographie",
  MG: "Mammographie",
  CT: "Scanner",
  MR: "IRM",
  unknown: "Non identifié",
};

const colorForType = (t: string) => TYPE_COLORS[t] || "#6b7280";
const labelForType = (t: string) => TYPE_LABELS[t] || t;

type BucketGranularity = "single" | "day" | "week" | "month";

/**
 * Regroupe le timeseries quotidien par semaine ou mois. Les keys numériques
 * (= les types) sont sommées ; `date` devient la 1ʳᵉ date du bucket et
 * `dayLabel` est reformaté selon la granularité.
 */
function regroupTimeseries(
  daily: Array<Record<string, number | string>>,
  granularity: BucketGranularity,
  typeKeys: string[]
): Array<Record<string, number | string>> {
  if (granularity === "day") return daily;

  const bucketKey = (d: Date) => {
    if (granularity === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(startOfMonth(d), "yyyy-MM");
  };
  const bucketLabel = (d: Date) => {
    if (granularity === "week") {
      const start = startOfWeek(d, { weekStartsOn: 1 });
      return `sem. ${format(start, "dd/MM", { locale: fr })}`;
    }
    return format(d, "MMM yyyy", { locale: fr });
  };

  const byBucket = new Map<string, Record<string, number | string>>();
  for (const point of daily) {
    const date = new Date(String(point.date));
    const key = bucketKey(date);
    if (!byBucket.has(key)) {
      const init: Record<string, number | string> = { date: key, dayLabel: bucketLabel(date) };
      for (const t of typeKeys) init[t] = 0;
      byBucket.set(key, init);
    }
    const slot = byBucket.get(key)!;
    for (const t of typeKeys) {
      slot[t] = (slot[t] as number) + ((point[t] as number) || 0);
    }
  }
  return Array.from(byBucket.values());
}

/**
 * Donut + Multi-line par modalité. La granularité du multi-line est imposée
 * par la plage de dates (calculée côté page) pour rester cohérente avec le
 * range visible — pas de toggle qui pourrait donner l'impression de "voir plus"
 * que ce que le filtre temporel inclut réellement.
 */
function ModalityCharts({
  typeDistribution,
  typeTimeseries,
  typeKeys,
  granularity,
}: {
  typeDistribution: Record<string, number>;
  typeTimeseries: Array<Record<string, number | string>>;
  typeKeys: string[];
  granularity: BucketGranularity;
}) {

  // Données pour le donut : on garde seulement les types > 0, tri décroissant.
  const pieData = typeKeys
    .map((t) => ({ name: t, value: typeDistribution[t] ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = pieData.reduce((s, d) => s + d.value, 0);

  // Liste des types réellement présents dans les données (pour ne pas dessiner
  // des courbes plates à 0 pour les modalités absentes).
  const activeTypes = typeKeys.filter((t) => (typeDistribution[t] ?? 0) > 0);

  const lineData = regroupTimeseries(typeTimeseries, granularity, typeKeys);

  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      {/* ---------- Donut : répartition par modalité ---------- */}
      <Grid item xs={12} md={5}>
        <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
            Répartition par modalité
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            Types d&apos;examens concernés par un planning complet
          </Typography>

          {pieData.length === 0 ? (
            <Box
              sx={{
                height: 260,
                display: "grid",
                placeItems: "center",
                border: "1px dashed #e5e7eb",
                borderRadius: 2,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Aucune donnée sur la période.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ height: 260, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={colorForType(d.name)} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid rgba(72,200,175,0.3)",
                      fontSize: 12,
                      padding: "6px 10px",
                    }}
                    formatter={(value: any, name: any) => {
                      const pct = total > 0 ? Math.round(((value as number) / total) * 1000) / 10 : 0;
                      return [`${value} (${pct}%)`, labelForType(name as string)];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Total au centre */}
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>
                  {total}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  appels
                </Typography>
              </Box>
            </Box>
          )}

          {/* Légende custom avec compteurs */}
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ flexWrap: "wrap", gap: 1, mt: 1.5, justifyContent: "center" }}
          >
            {pieData.map((d) => (
              <Stack key={d.name} direction="row" alignItems="center" spacing={0.5}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: colorForType(d.name),
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {labelForType(d.name)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({d.value})
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
      </Grid>

      {/* ---------- Multi-line : évolution par modalité ---------- */}
      <Grid item xs={12} md={7}>
        <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 0.5, flexWrap: "wrap", gap: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={800}>
                Évolution par modalité
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Une courbe par type d&apos;examen
              </Typography>
            </Box>
            <Chip
              size="small"
              label={
                granularity === "single"
                  ? "Vue du jour"
                  : granularity === "day"
                  ? "Par jour"
                  : granularity === "week"
                  ? "Par semaine"
                  : "Par mois"
              }
              sx={{
                fontWeight: 600,
                bgcolor: "rgba(72,200,175,0.15)",
                color: "#2a6f64",
              }}
            />
          </Stack>

          {activeTypes.length === 0 ? (
            <Box
              sx={{
                height: 260,
                display: "grid",
                placeItems: "center",
                border: "1px dashed #e5e7eb",
                borderRadius: 2,
                mt: 1.5,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Aucune donnée sur la période.
              </Typography>
            </Box>
          ) : granularity === "single" ? (
            // Cas plage d'un seul jour : un BarChart vertical avec une barre
            // par modalité (un LineChart à 1 point n'a aucun sens visuellement).
            <Box sx={{ height: 260, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeTypes.map((t) => ({
                    type: t,
                    label: labelForType(t),
                    count: typeDistribution[t] ?? 0,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <ReTooltip
                    cursor={{ fill: "rgba(72,200,175,0.08)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid rgba(72,200,175,0.3)",
                      fontSize: 12,
                      padding: "6px 10px",
                    }}
                    formatter={(value: any) => [
                      `${value} appel${(value as number) > 1 ? "s" : ""}`,
                      "",
                    ]}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {activeTypes.map((t, i) => (
                      <Cell key={i} fill={colorForType(t)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ height: 260, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={lineData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                >
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
                    allowDecimals={false}
                  />
                  <ReTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid rgba(72,200,175,0.3)",
                      fontSize: 12,
                      padding: "6px 10px",
                    }}
                    formatter={(value: any, name: any) => [
                      value,
                      labelForType(name as string),
                    ]}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                    formatter={(value: string) => labelForType(value)}
                  />
                  {activeTypes.map((t) => (
                    <Line
                      key={t}
                      type="monotone"
                      dataKey={t}
                      stroke={colorForType(t)}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: colorForType(t), strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Card>
      </Grid>
    </Grid>
  );
}

// ---------- Page ----------
interface Props {
  params: { id: string };
}

export default function PlanningCompletPage({ params }: Props) {
  const userProductId = Number(params.id);

  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  });
  const [showPicker, setShowPicker] = useState(false);

  const [data, setData] = useState<AggregateResponse | null>(null);
  const [examNonPris, setExamNonPris] = useState<ExamNonPrisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tab actif : "planning" (planning complet) ou "exam" (non pris en charge). */
  const [activeTab, setActiveTab] = useState<"planning" | "exam">("planning");

  // Le label est résolu côté serveur via TalkSettings.exams.codeExamenClient
  // → exams[i].libelle. Ici on n'a plus qu'à lire `item.label` (qui retombe
  // sur le ris_code brut quand le mapping est introuvable).
  const labelFor = (item: AggregateItem): string => {
    if (item.examCode === "__unknown__") return "Code examen non identifié";
    return item.label || item.examCode;
  };

  // Fetch en parallèle des 2 routes (planning complet + examens non pris).
  // Une seule période sélectionnée pilote les deux.
  useEffect(() => {
    if (!userProductId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("userProductId", String(userProductId));
        params.set("from", range.from.toISOString());
        params.set("to", range.to.toISOString());
        const qs = params.toString();
        const [r1, r2] = await Promise.all([
          fetch(`/api/planning-complet/aggregate?${qs}`, { signal: controller.signal }),
          fetch(`/api/exam-non-pris/aggregate?${qs}`, { signal: controller.signal }),
        ]);
        if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
        setData(j1 as AggregateResponse);
        setExamNonPris(j2 as ExamNonPrisResponse);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [userProductId, range.from, range.to]);

  // Max counts pour les barres proportionnelles, par catégorie.
  const maxConfirmed = data?.confirmed.items[0]?.count ?? 0;
  const maxInvestigate = data?.toInvestigate.items[0]?.count ?? 0;

  /**
   * Granularité automatique du graphique par modalité, dérivée de la plage de
   * dates sélectionnée.
   *  - 1 jour exactement → "single" : bar chart par modalité (pas de courbe)
   *  - 2 → 14 jours      → par jour
   *  - 15 → 60 jours     → par semaine
   *  - > 60 jours        → par mois
   */
  const granularity: BucketGranularity = useMemo(() => {
    const days = differenceInCalendarDays(range.to, range.from) + 1;
    if (days <= 1) return "single";
    if (days <= 14) return "day";
    if (days <= 60) return "week";
    return "month";
  }, [range.from, range.to]);

  // Données pour le bar chart rdv_status (que les non-zéro).
  const rdvStatusBars = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.rdvStatusDistribution)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        label: RDV_STATUS_META[key]?.label ?? key,
        value,
        color: RDV_STATUS_META[key]?.color ?? "#9ca3af",
      }));
  }, [data]);

  // hasTimeseriesData : on a au moins un jour avec data → on affiche la courbe.
  const hasTimeseriesData = useMemo(() => {
    if (!data?.timeseries?.length) return false;
    return data.timeseries.some((p) => p.confirmed > 0 || p.toInvestigate > 0);
  }, [data]);

  return (
    <PageContainer
      title="Examens non couverts"
      description="Saturations de planning et redirections par examen non réalisé"
    >
      <Box>
        <SectionHeader
          title="Examens non couverts"
          subtitle="Planning complet et examens non pris en charge — par site, sur la période"
          actions={loading ? <Chip size="small" label="chargement…" variant="outlined" /> : undefined}
        />

        {/* ---------- Filtres période ---------- */}
        <Card elevation={1} sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
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
          {showPicker && (
            <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
              <DateRangePicker value={range} onChange={setRange} />
            </Box>
          )}
        </Card>

        {/* ---------- Sélecteur de fenêtre (tabs) ---------- */}
        <Card elevation={1} sx={{ mb: 3, overflow: "hidden" }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 700,
                fontSize: 14,
                minHeight: 56,
                py: 1.5,
              },
              "& .Mui-selected": { color: "#2a6f64 !important" },
              "& .MuiTabs-indicator": { backgroundColor: "#48C8AF", height: 3 },
            }}
          >
            <Tab
              value="planning"
              label={
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconCalendarOff size={18} />
                  <span>Planning complet</span>
                  {data && data.total > 0 && (
                    <Chip
                      size="small"
                      label={data.total}
                      sx={{
                        height: 20,
                        bgcolor: "rgba(124,45,77,0.15)",
                        color: "#7c2d4d",
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    />
                  )}
                </Stack>
              }
            />
            <Tab
              value="exam"
              label={
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconPhoneOff size={18} />
                  <span>Examens non pris en charge</span>
                  {examNonPris && examNonPris.total > 0 && (
                    <Chip
                      size="small"
                      label={examNonPris.total}
                      sx={{
                        height: 20,
                        bgcolor: "rgba(72,155,181,0.18)",
                        color: "#1e5a73",
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    />
                  )}
                </Stack>
              }
            />
          </Tabs>
        </Card>

        {/* ============================================================== */}
        {/* ================ FENÊTRE 1 : PLANNING COMPLET ================= */}
        {/* ============================================================== */}
        <Box sx={{ display: activeTab === "planning" ? "block" : "none" }}>

        {/* ---------- KPI globaux (3 cartes) ---------- */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(212,191,199,0.25)",
                    color: "#7c2d4d",
                  }}
                >
                  <IconCalendarOff size={24} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                    APPELS SANS CRÉNEAU
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25 }}>
                    {data ? data.total : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Tous cas confondus
                  </Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ p: 2.5, bgcolor: "rgba(72,200,175,0.05)", border: "1px solid rgba(72,200,175,0.25)" }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(72,200,175,0.18)",
                    color: "#2a6f64",
                  }}
                >
                  <IconArrowRight size={24} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                    PLANNING COMPLET CONFIRMÉ
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25, color: "#2a6f64" }}>
                    {data ? data.confirmed.total : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Redirigés ou fin d&apos;appel
                  </Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ p: 2.5, bgcolor: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(245,158,11,0.18)",
                    color: "#92400e",
                  }}
                >
                  <IconAlertTriangle size={24} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                    À EXAMINER
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25, color: "#92400e" }}>
                    {data ? data.toInvestigate.total : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Manque réel ou code à configurer
                  </Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
        </Grid>

        {error && (
          <Card elevation={1} sx={{ p: 3, mb: 3, bgcolor: "rgba(239,68,68,0.05)" }}>
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          </Card>
        )}

        {/* ---------- Distribution rdv_status + Tendance ---------- */}
        {data && data.total > 0 && (
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={5}>
              <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>
                  Répartition par statut
                </Typography>
                <Stack spacing={1.5}>
                  {rdvStatusBars.map((s) => {
                    const pct = data.total > 0 ? (s.value / data.total) * 100 : 0;
                    return (
                      <Box key={s.key}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Box sx={{ color: s.color, display: "flex" }}>
                            {RDV_STATUS_META[s.key]?.icon}
                          </Box>
                          <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
                            {s.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.value} ({Math.round(pct * 10) / 10}%)
                          </Typography>
                        </Stack>
                        <Box sx={{ height: 8, borderRadius: 4, bgcolor: "rgba(0,0,0,0.05)", overflow: "hidden" }}>
                          <Box
                            sx={{
                              width: `${pct}%`,
                              height: "100%",
                              bgcolor: s.color,
                              transition: "width 400ms ease",
                            }}
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}
                >
                  <Typography variant="subtitle2" fontWeight={800} sx={{ flex: 1 }}>
                    Tendance temporelle
                  </Typography>
                  <Chip
                    size="small"
                    label={
                      granularity === "single"
                        ? "Vue du jour"
                        : granularity === "day"
                        ? "Par jour"
                        : granularity === "week"
                        ? "Par semaine"
                        : "Par mois"
                    }
                    sx={{
                      fontWeight: 600,
                      bgcolor: "rgba(72,200,175,0.15)",
                      color: "#2a6f64",
                    }}
                  />
                </Stack>
                {hasTimeseriesData ? (
                  granularity === "single" ? (
                    // Cas plage d'un seul jour : 2 barres comparatives au lieu
                    // de courbes vides à 1 point.
                    <Box sx={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { label: "Planning complet", count: data.confirmed.total, color: "#48C8AF" },
                            { label: "À examiner", count: data.toInvestigate.total, color: "#f59e0b" },
                          ]}
                          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                        >
                          <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={{ stroke: "#e5e7eb" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <ReTooltip
                            cursor={{ fill: "rgba(72,200,175,0.08)" }}
                            contentStyle={{
                              borderRadius: 8,
                              border: "1px solid rgba(72,200,175,0.3)",
                              fontSize: 12,
                              padding: "6px 10px",
                            }}
                            formatter={(value: any) => [
                              `${value} appel${(value as number) > 1 ? "s" : ""}`,
                              "",
                            ]}
                          />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={80}>
                            <Cell fill="#48C8AF" />
                            <Cell fill="#f59e0b" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                  <Box sx={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.timeseries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id="pc-confirmed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#48C8AF" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#48C8AF" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="pc-investigate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
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
                          allowDecimals={false}
                        />
                        <ReTooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid rgba(72,200,175,0.3)",
                            fontSize: 12,
                            padding: "6px 10px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="confirmed"
                          name="Planning complet"
                          stroke="#48C8AF"
                          strokeWidth={2.5}
                          fill="url(#pc-confirmed)"
                          dot={{ r: 2.5, fill: "#48C8AF", strokeWidth: 0 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="toInvestigate"
                          name="À examiner"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          fill="url(#pc-investigate)"
                          dot={{ r: 2.5, fill: "#f59e0b", strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                  )
                ) : (
                  <Box
                    sx={{
                      height: 180,
                      display: "grid",
                      placeItems: "center",
                      border: "1px dashed #e5e7eb",
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Pas de tendance sur la période.
                    </Typography>
                  </Box>
                )}
              </Card>
            </Grid>
          </Grid>
        )}

        {/* ---------- Graphiques par modalité (donut + multi-line) ---------- */}
        {data && data.total > 0 && (
          <ModalityCharts
            typeDistribution={data.typeDistribution}
            typeTimeseries={data.typeTimeseries}
            typeKeys={data.typeKeys}
            granularity={granularity}
          />
        )}

        {/* ---------- 2 listes : Planning complet confirmé + À examiner ---------- */}
        {loading && !data ? (
          <Stack spacing={1.5}>
            {[0, 1, 2].map((i) => (
              <Card key={i} elevation={1} sx={{ p: 2 }}>
                <Skeleton variant="text" width="40%" height={24} />
                <Skeleton variant="text" width="60%" height={18} sx={{ mt: 1 }} />
              </Card>
            ))}
          </Stack>
        ) : data && data.total === 0 ? (
          <Card
            elevation={1}
            sx={{ p: 6, display: "grid", placeItems: "center", border: "1px dashed #e5e7eb" }}
          >
            <Typography variant="body2" color="text.secondary">
              Aucun appel sans créneau disponible sur la période sélectionnée.
            </Typography>
          </Card>
        ) : data ? (
          <Stack spacing={3}>
            {/* === Planning complet confirmé === */}
            {data.confirmed.items.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 24,
                      borderRadius: 2,
                      bgcolor: "#48C8AF",
                    }}
                  />
                  <Typography variant="h6" fontWeight={800}>
                    Planning complet confirmé
                  </Typography>
                  <Chip
                    size="small"
                    label={`${data.confirmed.total} appel${data.confirmed.total > 1 ? "s" : ""}`}
                    sx={{
                      bgcolor: "rgba(72,200,175,0.18)",
                      color: "#2a6f64",
                      fontWeight: 700,
                    }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                  Redirection ou fin d&apos;appel — vrais cas de saturation du planning.
                </Typography>
                <ScrollableCardList>
                  {data.confirmed.items.map((item) => (
                    <ExamCard
                      key={item.examCode}
                      item={item}
                      label={labelFor(item)}
                      pct={maxConfirmed > 0 ? (item.count / maxConfirmed) * 100 : 0}
                      accent="#48C8AF"
                      accentLight="rgba(72,200,175,0.18)"
                      accentText="#2a6f64"
                    />
                  ))}
                </ScrollableCardList>
              </Box>
            )}

            {/* === À investiguer === */}
            {data.toInvestigate.items.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 24,
                      borderRadius: 2,
                      bgcolor: "#f59e0b",
                    }}
                  />
                  <Typography variant="h6" fontWeight={800}>
                    À examiner
                  </Typography>
                  <Chip
                    size="small"
                    label={`${data.toInvestigate.total} appel${data.toInvestigate.total > 1 ? "s" : ""}`}
                    sx={{
                      bgcolor: "rgba(245,158,11,0.18)",
                      color: "#92400e",
                      fontWeight: 700,
                    }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                  Cas ambigus — il peut s&apos;agir d&apos;un vrai manque de créneaux ou d&apos;un code examen mal configuré. À examiner au cas par cas.
                </Typography>
                <ScrollableCardList>
                  {data.toInvestigate.items.map((item) => (
                    <ExamCard
                      key={item.examCode}
                      item={item}
                      label={labelFor(item)}
                      pct={maxInvestigate > 0 ? (item.count / maxInvestigate) * 100 : 0}
                      accent="#f59e0b"
                      accentLight="rgba(245,158,11,0.18)"
                      accentText="#92400e"
                    />
                  ))}
                </ScrollableCardList>
              </Box>
            )}
          </Stack>
        ) : null}

        </Box> {/* end fenêtre 1 */}

        {/* ============================================================== */}
        {/* ============ FENÊTRE 2 : EXAMENS NON PRIS EN CHARGE ========== */}
        {/* ============================================================== */}
        <Box sx={{ display: activeTab === "exam" ? "block" : "none" }}>

          {/* ---------- KPI globaux ---------- */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Card elevation={1} sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(72,155,181,0.18)",
                      color: "#1e5a73",
                    }}
                  >
                    <IconPhoneOff size={24} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5 }}
                    >
                      PATIENTS REDIRIGÉS
                    </Typography>
                    <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25 }}>
                      {examNonPris ? examNonPris.total : "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Examens et modalités confondus
                    </Typography>
                  </Box>
                </Stack>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card
                elevation={1}
                sx={{
                  p: 2.5,
                  bgcolor: "rgba(72,155,181,0.06)",
                  border: "1px solid rgba(72,155,181,0.3)",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(72,155,181,0.22)",
                      color: "#1e5a73",
                    }}
                  >
                    <IconHash size={24} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5 }}
                    >
                      EXAMENS NON PRATIQUÉS
                    </Typography>
                    <Typography
                      variant="h4"
                      fontWeight={800}
                      sx={{ lineHeight: 1.1, mt: 0.25, color: "#1e5a73" }}
                    >
                      {examNonPris ? examNonPris.codes.total : "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      À ajouter à votre configuration
                    </Typography>
                  </Box>
                </Stack>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card
                elevation={1}
                sx={{
                  p: 2.5,
                  bgcolor: "rgba(168,85,247,0.05)",
                  border: "1px solid rgba(168,85,247,0.3)",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(168,85,247,0.18)",
                      color: "#6b21a8",
                    }}
                  >
                    <IconAlertTriangle size={24} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, letterSpacing: 0.5 }}
                    >
                      MODALITÉS NON ASSURÉES
                    </Typography>
                    <Typography
                      variant="h4"
                      fontWeight={800}
                      sx={{ lineHeight: 1.1, mt: 0.25, color: "#6b21a8" }}
                    >
                      {examNonPris ? examNonPris.bookableTypes.total : "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Types d&apos;examens non réalisés
                    </Typography>
                  </Box>
                </Stack>
              </Card>
            </Grid>
          </Grid>

          {/* ---------- Distribution par modalité + Tendance ---------- */}
          {examNonPris && examNonPris.total > 0 && (
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} md={5}>
                <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
                    Répartition par modalité
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 2 }}
                  >
                    Répartition des examens non pratiqués par modalité
                  </Typography>
                  <Stack spacing={1.5}>
                    {Object.entries(examNonPris.typeDistribution)
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const pct =
                          examNonPris.codes.total > 0
                            ? (count / examNonPris.codes.total) * 100
                            : 0;
                        const label =
                          type === "unknown"
                            ? "Type inconnu"
                            : type;
                        return (
                          <Box key={type}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ mb: 0.5 }}
                            >
                              <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
                                {label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {count} ({Math.round(pct * 10) / 10}%)
                              </Typography>
                            </Stack>
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
                                  bgcolor: "#4899B5",
                                  transition: "width 400ms ease",
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                    {Object.keys(examNonPris.typeDistribution).length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Aucun examen non pratiqué sur la période.
                      </Typography>
                    )}
                  </Stack>
                </Card>
              </Grid>

              <Grid item xs={12} md={7}>
                <Card elevation={1} sx={{ p: 2.5, height: "100%" }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}
                  >
                    <Typography variant="subtitle2" fontWeight={800} sx={{ flex: 1 }}>
                      Tendance temporelle
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        granularity === "single"
                          ? "Vue du jour"
                          : granularity === "day"
                          ? "Par jour"
                          : granularity === "week"
                          ? "Par semaine"
                          : "Par mois"
                      }
                      sx={{
                        fontWeight: 600,
                        bgcolor: "rgba(72,155,181,0.15)",
                        color: "#1e5a73",
                      }}
                    />
                  </Stack>
                  {granularity === "single" ? (
                    <Box sx={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { label: "Examens non pratiqués", count: examNonPris.codes.total, color: "#4899B5" },
                            { label: "Modalités non assurées", count: examNonPris.bookableTypes.total, color: "#a855f7" },
                          ]}
                          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                        >
                          <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={{ stroke: "#e5e7eb" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <ReTooltip
                            cursor={{ fill: "rgba(72,155,181,0.08)" }}
                            contentStyle={{
                              borderRadius: 8,
                              border: "1px solid rgba(72,155,181,0.3)",
                              fontSize: 12,
                              padding: "6px 10px",
                            }}
                            formatter={(value: any) => [
                              `${value} appel${(value as number) > 1 ? "s" : ""}`,
                              "",
                            ]}
                          />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={80}>
                            <Cell fill="#4899B5" />
                            <Cell fill="#a855f7" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : (
                  <Box sx={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={examNonPris.timeseries}
                        margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient id="enp-codes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4899B5" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#4899B5" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="enp-types" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#f3f4f6"
                          strokeDasharray="3 3"
                          vertical={false}
                        />
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
                          allowDecimals={false}
                        />
                        <ReTooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid rgba(72,155,181,0.3)",
                            fontSize: 12,
                            padding: "6px 10px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="codes"
                          name="Examens non pratiqués"
                          stroke="#4899B5"
                          strokeWidth={2.5}
                          fill="url(#enp-codes)"
                          dot={{ r: 2.5, fill: "#4899B5", strokeWidth: 0 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="types"
                          name="Modalités non assurées"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          fill="url(#enp-types)"
                          dot={{ r: 2.5, fill: "#a855f7", strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                  )}
                </Card>
              </Grid>
            </Grid>
          )}

          {/* ---------- 2 listes : Codes + Types ---------- */}
          {loading && !examNonPris ? (
            <Stack spacing={1.5}>
              {[0, 1, 2].map((i) => (
                <Card key={i} elevation={1} sx={{ p: 2 }}>
                  <Skeleton variant="text" width="40%" height={24} />
                  <Skeleton variant="text" width="60%" height={18} sx={{ mt: 1 }} />
                </Card>
              ))}
            </Stack>
          ) : examNonPris && examNonPris.total === 0 ? (
            <Card
              elevation={1}
              sx={{ p: 6, display: "grid", placeItems: "center", border: "1px dashed #e5e7eb" }}
            >
              <Typography variant="body2" color="text.secondary">
                Aucun examen non couvert sur la période.
              </Typography>
            </Card>
          ) : examNonPris ? (
            <Stack spacing={3}>
              {/* === Codes examens précis (Cas A) === */}
              {examNonPris.codes.items.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <Box
                      sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: "#4899B5" }}
                    />
                    <Typography variant="h6" fontWeight={800}>
                      Examens non pratiqués
                    </Typography>
                    <Chip
                      size="small"
                      label={`${examNonPris.codes.total} appel${examNonPris.codes.total > 1 ? "s" : ""}`}
                      sx={{
                        bgcolor: "rgba(72,155,181,0.18)",
                        color: "#1e5a73",
                        fontWeight: 700,
                      }}
                    />
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1.5 }}
                  >
                    Un code qui revient souvent ici correspond probablement à un examen
                    que le centre réalise mais qui n&apos;a pas encore été ajouté à la configuration.
                  </Typography>
                  <ScrollableCardList>
                    {examNonPris.codes.items.map((item) => {
                      const maxC = examNonPris.codes.items[0]?.count ?? 0;
                      const pct = maxC > 0 ? (item.count / maxC) * 100 : 0;
                      return (
                        <Card
                          key={item.examCode}
                          elevation={1}
                          sx={{
                            p: 2,
                            position: "relative",
                            overflow: "hidden",
                            transition: "transform 180ms ease, box-shadow 180ms ease",
                            "&:hover": {
                              transform: "translateY(-1px)",
                              boxShadow: "0 6px 18px rgba(72,155,181,0.25)",
                            },
                          }}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${pct}%`,
                              bgcolor: "rgba(72,155,181,0.18)",
                              transition: "width 400ms ease",
                            }}
                          />
                          <Stack
                            direction="row"
                            spacing={2}
                            alignItems="center"
                            sx={{ position: "relative" }}
                          >
                            <Box
                              sx={{
                                minWidth: 56,
                                height: 56,
                                px: 1.5,
                                borderRadius: "12px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: "#fff",
                                border: "2px solid #4899B5",
                                color: "#1e5a73",
                                flexShrink: 0,
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}
                              >
                                {item.examCode === "__unknown__" ? "?" : item.examCode}
                              </Typography>
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                                <Typography variant="subtitle1" fontWeight={700} noWrap>
                                  {item.examCode === "__unknown__"
                                    ? "Code examen non identifié"
                                    : item.label || item.examCode}
                                </Typography>
                                {item.type && (
                                  <Chip
                                    size="small"
                                    label={item.type}
                                    sx={{
                                      height: 18,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      bgcolor: "rgba(72,155,181,0.15)",
                                      color: "#1e5a73",
                                    }}
                                  />
                                )}
                              </Stack>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <IconClock size={14} color="#6b7280" />
                                <Typography variant="caption" color="text.secondary">
                                  Dernier : {formatDateTime(item.lastCallAt)}
                                </Typography>
                              </Stack>
                            </Box>

                            <Box
                              sx={{
                                minWidth: 64,
                                height: 56,
                                px: 1.5,
                                borderRadius: "12px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                bgcolor: "#4899B5",
                                color: "#fff",
                                flexShrink: 0,
                              }}
                            >
                              <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>
                                {item.count}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, opacity: 0.85, lineHeight: 1, mt: 0.25 }}
                              >
                                appel{item.count > 1 ? "s" : ""}
                              </Typography>
                            </Box>
                          </Stack>
                        </Card>
                      );
                    })}
                  </ScrollableCardList>
                </Box>
              )}

              {/* === Types entiers refusés (Cas B) === */}
              {examNonPris.bookableTypes.items.length > 0 && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <Box
                      sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: "#a855f7" }}
                    />
                    <Typography variant="h6" fontWeight={800}>
                      Modalités non assurées
                    </Typography>
                    <Chip
                      size="small"
                      label={`${examNonPris.bookableTypes.total} appel${examNonPris.bookableTypes.total > 1 ? "s" : ""}`}
                      sx={{
                        bgcolor: "rgba(168,85,247,0.18)",
                        color: "#6b21a8",
                        fontWeight: 700,
                      }}
                    />
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1.5 }}
                  >
                    Modalités refusées par le centre. Vérifiez que les types affichés ici
                    correspondent bien aux examens que vous ne pratiquez pas.
                  </Typography>
                  <ScrollableCardList>
                    {examNonPris.bookableTypes.items.map((item) => {
                      const maxT = examNonPris.bookableTypes.items[0]?.count ?? 0;
                      const pct = maxT > 0 ? (item.count / maxT) * 100 : 0;
                      return (
                        <Card
                          key={item.type}
                          elevation={1}
                          sx={{
                            p: 2,
                            position: "relative",
                            overflow: "hidden",
                            transition: "transform 180ms ease, box-shadow 180ms ease",
                            "&:hover": {
                              transform: "translateY(-1px)",
                              boxShadow: "0 6px 18px rgba(168,85,247,0.25)",
                            },
                          }}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${pct}%`,
                              bgcolor: "rgba(168,85,247,0.18)",
                              transition: "width 400ms ease",
                            }}
                          />
                          <Stack
                            direction="row"
                            spacing={2}
                            alignItems="center"
                            sx={{ position: "relative" }}
                          >
                            <Box
                              sx={{
                                minWidth: 64,
                                height: 56,
                                px: 1.5,
                                borderRadius: "12px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: "#fff",
                                border: "2px solid #a855f7",
                                color: "#6b21a8",
                                flexShrink: 0,
                              }}
                            >
                              <Typography
                                variant="subtitle1"
                                sx={{ fontWeight: 800, letterSpacing: 1, lineHeight: 1 }}
                              >
                                {item.type === "__unknown__" ? "?" : item.type}
                              </Typography>
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle1" fontWeight={700} noWrap>
                                {item.type === "__unknown__"
                                  ? "Type non identifié"
                                  : `Modalité ${item.type}`}
                              </Typography>
                              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                                <IconClock size={14} color="#6b7280" />
                                <Typography variant="caption" color="text.secondary">
                                  Dernier : {formatDateTime(item.lastCallAt)}
                                </Typography>
                              </Stack>
                            </Box>

                            <Box
                              sx={{
                                minWidth: 64,
                                height: 56,
                                px: 1.5,
                                borderRadius: "12px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                bgcolor: "#a855f7",
                                color: "#fff",
                                flexShrink: 0,
                              }}
                            >
                              <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>
                                {item.count}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, opacity: 0.85, lineHeight: 1, mt: 0.25 }}
                              >
                                appel{item.count > 1 ? "s" : ""}
                              </Typography>
                            </Box>
                          </Stack>
                        </Card>
                      );
                    })}
                  </ScrollableCardList>
                </Box>
              )}
            </Stack>
          ) : null}
        </Box> {/* end fenêtre 2 */}
      </Box>
    </PageContainer>
  );
}

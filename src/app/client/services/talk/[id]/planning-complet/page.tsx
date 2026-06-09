"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Chip,
  Grid,
  Skeleton,
  Stack,
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
} from "recharts";
import { startOfDay, endOfDay, subDays } from "date-fns";
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
};

// ---------- Helpers ----------
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `${date} · ${time}`;
}

const RDV_STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  full_planning_redirect: {
    label: "Redirigés",
    color: "#48C8AF",
    icon: <IconArrowRight size={18} />,
  },
  full_planning_end: {
    label: "Fin d'appel",
    color: "#4899B5",
    icon: <IconPhoneOff size={18} />,
  },
  no_slot: {
    label: "0 créneau (ambigu)",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le label est résolu côté serveur via TalkSettings.exams.codeExamenClient
  // → exams[i].libelle. Ici on n'a plus qu'à lire `item.label` (qui retombe
  // sur le ris_code brut quand le mapping est introuvable).
  const labelFor = (item: AggregateItem): string => {
    if (item.examCode === "__unknown__") return "Code examen non identifié";
    return item.label || item.examCode;
  };

  // Fetch agrégat
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
        const res = await fetch(`/api/planning-complet/aggregate?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AggregateResponse;
        setData(json);
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
      title="Planning complet"
      description="Examens sans créneau disponible — par site, sur la période"
    >
      <Box>
        <SectionHeader
          title="Planning complet"
          subtitle="Examens pour lesquels le bot n'a trouvé aucun créneau"
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
                    APPELS · 0 CRÉNEAU
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25 }}>
                    {data ? data.total : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Tous statuts confondus
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
                    À INVESTIGUER (0 CRÉNEAU)
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1, mt: 0.25, color: "#92400e" }}>
                    {data ? data.toInvestigate.total : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Manque réel OU code mal configuré
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
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>
                  Tendance temporelle
                </Typography>
                {hasTimeseriesData ? (
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
                          name="À investiguer"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          fill="url(#pc-investigate)"
                          dot={{ r: 2.5, fill: "#f59e0b", strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
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

        {/* ---------- 2 listes : Planning complet confirmé + À investiguer ---------- */}
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
              Aucun appel "0 créneau" sur la période sélectionnée.
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
                <Stack spacing={1.5}>
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
                </Stack>
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
                    À investiguer
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
                  Statut <code>no_slot</code> — soit un vrai manque de créneaux, soit un code examen mal configuré côté site. À examiner code par code.
                </Typography>
                <Stack spacing={1.5}>
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
                </Stack>
              </Box>
            )}
          </Stack>
        ) : null}
      </Box>
    </PageContainer>
  );
}

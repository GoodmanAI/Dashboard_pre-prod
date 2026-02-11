"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Skeleton,
  Popover
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Cell,
  Legend,
  Pie,
} from "recharts";
import {
  QueryStats as IconTotal,
  EventAvailable as IconRDV,
  LocalHospital as IconUrgence,
  Info as IconInfo,
  AccessTime as IconHeures,
} from "@mui/icons-material";
import { useCentre } from "@/app/context/CentreContext";
import { subDays, startOfDay } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";

/* =========================================================
   Types & utils
========================================================= */

const NEEDLE_BASE_RADIUS_PX = 5;
const NEEDLE_COLOR = '#d0d000';

interface Call {
  id: number;
  userId: number;
  caller: string;
  called: string;
  intent?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  birthdate?: string | null;
  createdAt: string; // ISO
  steps: string[];
  durationSeconds?: number | null;
  durationSec?: number | null;
  handled?: boolean | null;
  resolution?: string | null;
}

const PALETTE = {
  cyan:   "#37D2D2",
  green:  "#37D253",
  blue:   "#1976D2",
  purple: "#6237D2",
  pink:   "#D237C2",
  teal:   "#2FB9A6",
  lime:   "#9AD237",
  indigo: "#3F37D2",
  violet: "#9A37D2",
  coral:  "#D25A37",
  amber:  "#D2A237",
  grey:   "#838383",
};

const PIE_COLORS = [
  PALETTE.cyan,
  PALETTE.green,
  PALETTE.blue,
  PALETTE.purple,
  PALETTE.pink,
  PALETTE.teal,
  PALETTE.lime,
  PALETTE.indigo,
  PALETTE.violet,
  PALETTE.coral,
  PALETTE.amber,
  PALETTE.grey,
];

const now = () => new Date();
const minusDays = (d: Date, days: number) => new Date(d.getTime() - days * 24 * 3600 * 1000);

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

const RESO_KEYS = ["rdv", "info", "modification", "annulation", "urgence"] as const;
type ResoKey = (typeof RESO_KEYS)[number];

function normalizeReso(call: any): ResoKey | "autre" {
  const s = (call.resolution ?? call.intent ?? "").toLowerCase().trim();
  if (call?.stats?.rdv_booked != 0) return "rdv";
  if (call?.stats?.intents.includes("renseignements")) return "info";
  if (call?.stats?.intents.includes("modification_rdv")) return "modification";
  if (call?.stats?.intents.includes("annulation_rdv")) return "annulation";
  if (call?.stats?.emergency == true) return "urgence";
  return "autre";
}

function getIndice(calls: any[]): number {
  const indice = calls.reduce((acc: any, c: any) => {
    if (c.stats.error_logic && c.stats.error_logic > 0){
      return acc + 1
    } 
    return acc;
  }, 0);
  
  return Math.floor((1 - (indice / calls.length)) * 100);
}

function sumDurationsSec(calls: any): number {
  return calls.reduce((acc: any, c: any) => {
    const sec = (c.stats.duration ?? c.stats.duration ?? 0) as number;
    return acc + (Number(sec) || 0);
  }, 0);
}

function formatHoursFromSeconds(totalSeconds: number, decimals = 1): string {
  const hrs = totalSeconds / 3600;
  return `${hrs.toFixed(decimals)} h`;
}

function secondsToMinLabel(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}min${String(ss).padStart(2, "0")}`;
}

/* =========================================================
   UI components
========================================================= */

function StatTile({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        height: 96,
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
          bgcolor: "rgba(72,200,175,0.15)",
          color: "#2a6f64",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700} noWrap>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function StatTileSkeleton() {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        height: 96,
      }}
      elevation={1}
    >
      <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: "10px" }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Skeleton variant="text" width={120} height={18} />
        <Skeleton variant="text" width="60%" height={30} />
      </Box>
    </Paper>
  );
}

function ChartSkeleton() {
  return (
    <Box sx={{ width: "100%", height: 280, display: "grid", placeItems: "center" }}>
      <Skeleton variant="rounded" width="100%" height="100%" />
    </Box>
  );
}

/* =========================================================
   Page principale
========================================================= */

export default function StatsAppelPage({ params }: any) {
  const userProductId = Number(params.id);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const { data: session, status } = useSession();
  const router = useRouter();
  const { centres, selectedUserId } = useCentre();

  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  // Distribution par sous-centre
  const [centresCounts, setCentresCounts] = useState<Array<{ id: number; name: string; count: number }>>([]);
  const [loadingCentres, setLoadingCentres] = useState(false);

  // Date range state - CORRIGÉ : déplacé avant les useEffect
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = startOfDay(new Date());
    return {
      from: subDays(today, 6),
      to: today,
    };
  });

  const anchorRef = useRef<string | null>(null);
  const reqSeqRef = useRef(0);

  useEffect(() => {
    if (!anchorRef.current) {
      anchorRef.current = new Date().toISOString();
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  const effectiveUserId = useMemo(() => {
    if (centres.length > 0) return selectedUserId ?? null;
    const sid = session?.user?.id as number | undefined;
    return sid && Number.isFinite(Number(sid)) ? Number(sid) : null;
  }, [centres.length, selectedUserId, session?.user?.id]);

  const daysAgoForRange = useMemo(() => {
    const diff =
      (dateRange.to.getTime() - dateRange.from.getTime()) /
      (1000 * 60 * 60 * 24);

    return Math.max(1, Math.ceil(diff));
  }, [dateRange]);

  // Fetch principal
  useEffect(() => {
    if (status !== "authenticated") return;

    if ((centres.length > 0 && !effectiveUserId) || !effectiveUserId) {
      setCalls([]);
      setLoading(false);
      return;
    }

    const seq = ++reqSeqRef.current;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);

        const params = new URLSearchParams({
          daysAgo: String(daysAgoForRange),
          demo: "1",
          demoDays: "35",
          anchor: anchorRef.current as string,
          asUserId: String(effectiveUserId),
          demoPreserveDow: "1",
        });

        const callsUrl = `/api/calls?${params.toString()}&userProductId=${userProductId}`;

        const callsRes = await fetch(callsUrl, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });

        const response = await callsRes.json();

        const filteredCalls = response.filter((call: any) => {
          const callTime = new Date(call.createdAt).getTime();
          return (
            callTime >= dateRange.from.getTime() &&
            callTime <= dateRange.to.getTime()
          );
        });

        setCalls(filteredCalls);

        if (reqSeqRef.current !== seq) return;

      } catch (e) {
        if (!isAbortError(e)) {
          console.error("Erreur lors du fetch des appels:", e);
        }
      } finally {
        if (reqSeqRef.current === seq) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [status, centres.length, effectiveUserId, dateRange, userProductId, daysAgoForRange]);

  // Fetch sous-centres (ADMIN)
  useEffect(() => {
    if (status !== "authenticated") return;

    if (centres.length === 0) {
      setCentresCounts([]);
      return;
    }

    const controller = new AbortController();
    let aborted = false;

    (async () => {
      try {
        setLoadingCentres(true);

        const daysAgo = daysAgoForRange;

        const results = await Promise.all(
          (centres as any[]).map(async (c: any) => {
            const id = Number(c?.id);
            if (!Number.isFinite(id)) {
              return { id: -1, name: "Centre inconnu", count: 0 };
            }

            const name =
              c?.name ?? c?.label ?? c?.title ?? c?.user?.name ?? `Centre ${id}`;

            const params = new URLSearchParams({
              daysAgo: String(daysAgo),
              demo: "1",
              demoDays: "35",
              anchor: anchorRef.current as string,
              asUserId: String(id),
              demoPreserveDow: "1",
            });

            try {
              const res = await fetch(`/api/calls?${params.toString()}`, {
                signal: controller.signal,
                cache: "no-store",
                headers: { "Cache-Control": "no-store" },
              });

              if (!res.ok) return { id, name, count: 0 };

              const list: Call[] = await res.json();
              return { id, name, count: Array.isArray(list) ? list.length : 0 };
            } catch (e) {
              if (isAbortError(e)) return { id, name, count: 0 };
              return { id, name, count: 0 };
            }
          })
        );

        if (!aborted) {
          setCentresCounts(results.filter((r) => r.id !== -1));
        }
      } finally {
        if (!aborted) setLoadingCentres(false);
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [status, centres, dateRange, daysAgoForRange]);

  /* ========== Stats tuiles ========== */
  const totalAppels = calls.length;
  const nbRDV = useMemo(() => calls.filter((c) => normalizeReso(c) === "rdv").length, [calls]);
  const nbUrgence = useMemo(() => calls.filter((c) => normalizeReso(c) === "urgence").length, [calls]);
  const nbInfo = useMemo(() => calls.filter((c) => normalizeReso(c) === "info").length, [calls]);

  const indicePerformance = useMemo(() => {
    if (calls.length === 0) return 0;
    return getIndice(calls);
  }, [calls]);

  const heuresPrisEnCharge = useMemo(() => {
    const totalSeconds = sumDurationsSec(calls);
    return formatHoursFromSeconds(totalSeconds, 2);
  }, [calls]);

  /* ========== Camembert (transfer) ========== */
  const TRANSFER_KEYS = [
    "redirect",
    "error",
    "exam_type",
    "exam_mult",
    "exam_interv",
    "emergency",
    "doctor",
    "admin",
    "result",
    "incident",
    "identification",
  ] as const;

  type TransferKey = (typeof TRANSFER_KEYS)[number];

  const TRANSFER_LABELS: Record<string, string> = {
    redirect: "Redirection demandée",
    error: "Erreur",
    exam_type: "Type d'examen non pris en charge",
    exam_mult: "Plusieurs examens demandés",
    exam_interv: "Demande de radio interventionnelle",
    emergency: "Urgence",
    doctor: "Professionnel de santé",
    admin: "Démarches administratives",
    result: "Résultats d'examens",
    incident: "Demande à traiter par un humain",
    identification: "Problème d'identification",
  };

  const transferData = useMemo(() => {
    const buckets: Record<TransferKey, number> = {
      redirect: 0,
      error: 0,
      exam_type: 0,
      exam_mult: 0,
      exam_interv: 0,
      emergency: 0,
      doctor: 0,
      admin: 0,
      result: 0,
      incident: 0,
      identification: 0,
    };

    for (const c of calls) {
      const reason = (c as any)?.stats?.transferReason as TransferKey | undefined;
      if (reason && reason in buckets) {
        buckets[reason]++;
      }
    }

    const arr = TRANSFER_KEYS.map((key) => ({
      key,
      name: TRANSFER_LABELS[key],
      value: buckets[key],
    }));

    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [calls]);

  /* ========== Camembert (intent) ========== */
  const pieData = useMemo(() => {
    const buckets: Record<ResoKey | "autre", number> = {
      rdv: 0,
      info: 0,
      modification: 0,
      annulation: 0,
      urgence: 0,
      autre: 0,
    };
    for (const c of calls) buckets[normalizeReso(c)]++;

    const arr = [
      { name: "Prise de RDV", value: buckets.rdv },
      { name: "Informations", value: buckets.info },
      { name: "Modifications", value: buckets.modification },
      { name: "Annulations", value: buckets.annulation },
      { name: "Urgences", value: buckets.urgence },
    ];
    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [calls]);

  /* ========== Histogramme ========== */
  const histogramData = useMemo(() => {
    const today = now();
    const map: Record<string, { total: number; redirect: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = minusDays(today, i);
      map[dayKey(d)] = { total: 0, redirect: 0 };
    }

    for (const c of calls) {
      const k = dayKey(new Date(c.createdAt));
      if (map[k]) {
        map[k].total++;
        if ((c as any)?.stats?.end_reason === "transfer") {
          map[k].redirect++;
        }
      }
    }

    return Object.entries(map).map(([k, v]) => ({
      name: `${k.slice(8, 10)}/${k.slice(5, 7)}`,
      normal: v.total - v.redirect,
      redirect: v.redirect,
    }));
  }, [calls]);

  function HistogramTooltip({ active, payload, label }: any) {
    if (!active || !payload || !payload.length) return null;

    const normal = payload.find((p: any) => p.dataKey === "normal")?.value ?? 0;
    const redirect = payload.find((p: any) => p.dataKey === "redirect")?.value ?? 0;
    const total = (Number(normal) || 0) + (Number(redirect) || 0);

    return (
      <Paper sx={{ p: 1.25 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{label}</Typography>
        <Typography variant="body2">Total : {total}</Typography>
        <Typography variant="body2" sx={{ color: PALETTE.cyan }}>
          Pris en charge : {normal}
        </Typography>
        <Typography variant="body2" sx={{ color: PALETTE.pink }}>
          Redirections : {redirect}
        </Typography>
      </Paper>
    );
  }

  const nbDays = useMemo(() => {
    const msPerDay = 1000 * 60 * 60 * 24;
    const diff =
      (dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay;

    return Math.max(1, Math.ceil(diff) + 1);
  }, [dateRange]);

  /* ========== Activité horaire ========== */
  const hourlyActivity = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => 0);

    for (const c of calls) {
      const hour = new Date(c.createdAt).getHours();
      counts[hour]++;
    }

    return counts.map((cnt, h) => ({
      hour: `${String(h).padStart(2, "0")}h`,
      value: Number((cnt / nbDays).toFixed(2)),
    }));
  }, [calls, nbDays]);

  /* ========== Durée moyenne par intention ========== */
  const avgByIntentData = useMemo(() => {
    const acc: Record<ResoKey, { total: number; n: number }> = {
      rdv: { total: 0, n: 0 },
      info: { total: 0, n: 0 },
      modification: { total: 0, n: 0 },
      annulation: { total: 0, n: 0 },
      urgence: { total: 0, n: 0 },
    };
    for (const c of calls) {
      const call = c as any;
      const k = normalizeReso(c);
      if (k === "autre") continue;
      const sec = (call.stats.duration ?? call.durationSec ?? 0) as number;
      acc[k].total += Number(sec) || 0;
      acc[k].n += 1;
    }
    const label: Record<ResoKey, string> = {
      rdv: "RDV",
      info: "Informations",
      modification: "Modifications",
      annulation: "Annulations",
      urgence: "Urgences",
    };
    return (Object.keys(acc) as ResoKey[])
      .map((k) => {
        const { total, n } = acc[k];
        const avgSec = n ? total / n : 0;
        return {
          name: label[k],
          avgMin: Number((avgSec / 60).toFixed(1)),
          avgSec,
        };
      })
      .filter((r) => r.avgSec > 0);
  }, [calls]);

  const isAbortError = (e: unknown) =>
    !!e && typeof e === "object" && (e as any).name === "AbortError";

  /* ========== Performance Gauge ========== */
  function getPerformanceColor(value: number) {
    if (value < 50) return "#E53935";
    if (value < 70) return "#FB8C00";
    if (value < 85) return "#FDD835";
    return "#43A047";
  }

  const PerformanceGauge = ({ value }: { value: number }) => {
    const color = getPerformanceColor(value);

    const data = [
      { name: "Performance", value, fill: color },
      { name: "Reste", value: Math.max(0, 100 - value), fill: "#E0E0E0" },
    ];

    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
            cx="50%"
            cy="80%"
            stroke="none"
            isAnimationActive
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>

          <text
            x="50%"
            y="70%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={42}
            fontWeight={800}
            fill={color}
          >
            {value}
          </text>

          <text
            x="50%"
            y="82%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fill="#888"
          >
            / 100
          </text>
        </PieChart>
      </ResponsiveContainer>
    );
  };

  /* ========== UI ========== */

  if (status === "authenticated" && centres.length > 0 && !effectiveUserId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sélectionnez un centre pour afficher les statistiques.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* En-tête */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Statistiques d&apos;appels
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Analyse personnalisable par période
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              Du {dateRange.from.toLocaleDateString()} au{" "}
              {dateRange.to.toLocaleDateString()}
            </Button>

            <Popover
              open={open}
              anchorEl={anchorEl}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Sélectionner une période
                </Typography>

                <DateRangePicker
                  value={dateRange}
                  onChange={(range) => {
                    setDateRange(range);
                    setAnchorEl(null); // ferme après sélection
                  }}
                />
              </Box>
            </Popover>
          </Box>

          <Button
            variant="outlined"
            onClick={() => router.push(`/client/services/talk/${userProductId}`)}
            sx={{
              borderColor: "#48C8AF",
              color: "#48C8AF",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
              textTransform: "none",
            }}
          >
            ← Retour à Talk
          </Button>
        </Box>
      </Box>

      {/* 5 tuiles */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0,1,2,3,4].map((i) => (
          <Grid item xs={12} sm={6} md={2.4} key={i}>
            {loading ? (
              <StatTileSkeleton />
            ) : i === 0 ? (
              <StatTile title="Total d&apos;appels" value={totalAppels} icon={<IconTotal />} />
            ) : i === 1 ? (
              <StatTile title="Prises de RDV" value={nbRDV} icon={<IconRDV />} />
            ) : i === 2 ? (
              <StatTile title="Urgences détectées" value={nbUrgence} icon={<IconUrgence />} />
            ) : i === 3 ? (
              <StatTile title="Informations" value={nbInfo} icon={<IconInfo />} />
            ) : (
              <StatTile title="Heures prises en charge" value={heuresPrisEnCharge} icon={<IconHeures />} />
            )}
          </Grid>
        ))}
      </Grid>

      {/* 3 blocs : Performance / Histogramme / Activité horaire */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Indice de Performance
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Correspond au pourcentage d&apos;appel où l&apos;IA a réussi à diriger le patient
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PerformanceGauge value={indicePerformance} />
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Histogramme
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Nombres d&apos;appels des 7 derniers jours
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals />
                    <ReTooltip content={<HistogramTooltip />} />
                    <Bar dataKey="normal"   stackId="calls"  fill={PALETTE.cyan} />
                    <Bar dataKey="redirect" stackId="calls" fill={PALETTE.pink} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Activité quotidienne
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Moyenne d&apos;appels par heure
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" interval={2} />
                    <YAxis allowDecimals />
                    <ReTooltip
                      formatter={(val: number) => [val, "Appels moyens / h"]}
                      labelFormatter={(label: string) => `Heure ${label}`}
                    />
                    <Bar dataKey="value" name="Appels moyens / h" fill={PALETTE.cyan} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* 3 blocs supplémentaires */}
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Raison du transfert
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Sur la période sélectionnée
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={transferData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {transferData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      wrapperStyle={{
                        maxHeight: 240,
                        overflowY: "auto",
                        paddingLeft: 8,
                        fontSize: 12,
                      }}
                    />                    
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Durée moyenne par intention
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Moyenne sur la période sélectionnée
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgByIntentData} layout="vertical" margin={{ left: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" />
                    <ReTooltip
                      formatter={(_val: number, _name: string, payload: any) => {
                        const secs = payload?.payload?.avgSec || 0;
                        return [secondsToMinLabel(secs), "Durée moyenne"];
                      }}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey="avgMin" name="Durée moyenne" fill={PALETTE.blue} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Répartition par type
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Sur la période sélectionnée
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={24} />
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

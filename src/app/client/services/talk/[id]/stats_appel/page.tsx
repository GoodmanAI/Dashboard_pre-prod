"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Skeleton,
  Popover,
  Select,
  MenuItem,
  Stack,
  Chip,
  Tooltip as MuiTooltip,
  Tab,
  Tabs,
} from "@mui/material";
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTalkBasePath } from "@/utils/talkRoutes";
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
  EditCalendar as IconAnnulMod,
  Block as IconExamNotHandled,
  EventBusy as IconPlanningFull,
  Biotech as IconRadioInterv,
  TaskAlt as IconConfirmRDV,
} from "@mui/icons-material";
import { useCentre } from "@/app/context/CentreContext";
import { subDays, startOfDay, endOfDay } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import DateRangePresets from "@/components/DateRangePresets";
import {
  TransferCategory,
  CATEGORY_META,
  CATEGORY_ORDER,
  getTransferMeta,
  isCounterTransfer,
} from "@/lib/transferReasons";
import { getLanguageMeta, LANGUAGE_META, LanguageCode } from "@/lib/languages";
import {
  HANGUP_CONTEXTS,
  UNKNOWN_HANGUP_CONTEXT,
  isHangup,
  getHangupContext,
  HangupContextKey,
} from "@/lib/hangupContext";
import {
  computeDelta,
  computePreviousRange,
  DeltaResult,
  DeltaDirection,
} from "@/lib/deltaCompare";
import {
  rowsToCsv,
  downloadCsv,
  isoDateForFilename,
  formatDateFr,
} from "@/lib/csvExport";
import { IconDownload } from "@tabler/icons-react";

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

const EXAM_LABELS: Record<string, string> = {
  RX: "Radiographie",
  CT: "Scanner",
  MR: "IRM",
  US: "Échographie",
  MG: "Mammographie",
};

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

function formatHoursFromSeconds(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h${String(mins).padStart(2, "0")}`;
}

function secondsToMinLabel(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}min${String(ss).padStart(2, "0")}`;
}

/* =========================================================
   Heatmap helpers
========================================================= */

/** Jours en français, ordre européen (Lun → Dim). */
const HEATMAP_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HEATMAP_DAYS_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Construit une matrice 7×24 [jour][heure] = count, à partir d'un array
 * d'appels et d'un filtre optionnel (pour ne compter que les RDV pris,
 * les planning complets, etc.).
 */
function buildHeatmap(
  calls: any[],
  filter?: (call: any) => boolean
): { matrix: number[][]; max: number; total: number } {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  let total = 0;
  for (const c of calls) {
    if (filter && !filter(c)) continue;
    if (!c?.createdAt) continue;
    const d = new Date(c.createdAt);
    // JS getDay() : 0=Dim..6=Sam → on remappe en Lun=0..Dim=6 (convention FR)
    const jsDay = d.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const hour = d.getHours();
    matrix[dayIdx][hour]++;
    total++;
    if (matrix[dayIdx][hour] > max) max = matrix[dayIdx][hour];
  }
  return { matrix, max, total };
}

/* =========================================================
   UI components
========================================================= */

/** Petit badge delta affiché sous la valeur principale d'une StatTile. */
function DeltaBadge({
  delta,
  previousLabel,
}: {
  delta: DeltaResult;
  previousLabel: string;
}) {
  // "insufficient" → on n'affiche rien (signal silencieux : période précédente
  // trop petite pour être statistiquement fiable).
  if (delta.kind === "insufficient") return null;

  const TONE_COLORS: Record<"positive" | "negative" | "neutral", { color: string; bg: string }> = {
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
    icon = delta.sign === "up" ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />;
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

function StatTile({
  title,
  value,
  icon,
  delta,
  previousLabel,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  /** Si fourni, affiche un badge "↗ +18%" sous la valeur. */
  delta?: DeltaResult;
  /** Suffixe humain pour le tooltip du badge (ex: "sur la semaine précédente"). */
  previousLabel?: string;
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
        {delta && <DeltaBadge delta={delta} previousLabel={previousLabel ?? ""} />}
      </Box>
    </Paper>
  );
}

function StatTileDouble({
  items,
  icon,
}: {
  items: {
    title: string;
    value: string | number;
    /** Si fourni, badge delta affiché sous la valeur de cet item. */
    delta?: DeltaResult;
    previousLabel?: string;
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
              {item.value}
            </Typography>
            {item.delta && (
              <DeltaBadge delta={item.delta} previousLabel={item.previousLabel ?? ""} />
            )}
          </Box>
        ))}
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

/**
 * Heatmap 7 jours × 24 heures. Une cellule par créneau, coloration par
 * intensité (clair → foncé) en fonction du max global de la matrice.
 *
 * - `colorRgb` : "R, G, B" — la cellule devient `rgba(R,G,B, 0.15→1)` selon
 *   l'intensité. Cellules vides : gris très clair.
 * - Tooltip au survol avec jour/heure/valeur.
 */
function Heatmap({
  matrix,
  max,
  colorRgb,
  metricLabel,
}: {
  matrix: number[][];
  max: number;
  colorRgb: string;
  metricLabel: string;
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
            sx={{ display: "flex", alignItems: "center", gap: "3px", mb: "3px" }}
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
                      ? `${HEATMAP_DAYS_FULL[dayIdx]} ${String(h).padStart(2, "0")}h — aucun`
                      : `${HEATMAP_DAYS_FULL[dayIdx]} ${String(h).padStart(2, "0")}h — ${value} ${metricLabel}`
                  }
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "4px",
                      bgcolor: bg,
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
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
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
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Plus
          </Typography>
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

/* =========================================================
   Page principale
========================================================= */

export default function StatsAppelPage({ params }: any) {
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const [mapping, setMapping]: any = useState(null);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { centres, selectedUserId } = useCentre();
  const [selectedExamCode, setSelectedExamCode] = useState<string | "all">("all");
  const [calls, setCalls] = useState<Call[]>([]);
  /** Appels de la période précédente — pour calcul des deltas sur les KPI. */
  const [previousCalls, setPreviousCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  // Distribution par sous-centre
  const [centresCounts, setCentresCounts] = useState<Array<{ id: number; name: string; count: number }>>([]);
  const [loadingCentres, setLoadingCentres] = useState(false);

  // Date range state - CORRIGÉ : déplacé avant les useEffect
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: endOfDay(today),
    };
  });
  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);
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

        const callsUrl = `/api/calls?${params.toString()}&userProductId=${userProductId}&mode=all`;

        const callsRes = await fetch(callsUrl, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });

        const response = await callsRes.json();

        // === NORMALISATION DES BORNES ===
        const nowDate = new Date();

        // Date minimum → toujours 00:00
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);

        // Date maximum
        const toDate = new Date(dateRange.to);

        // Si la date max est aujourd’hui → heure actuelle
        const isToday =
          toDate.toDateString() === nowDate.toDateString();

        if (isToday) {
          toDate.setTime(nowDate.getTime());
        } else {
          // Sinon → fin de journée
          toDate.setHours(23, 59, 59, 999);
        }

        const fromTime = fromDate.getTime();
        const toTime = toDate.getTime();

        const filteredCalls = response.filter((call: any) => {
          const callTime = new Date(call.createdAt).getTime();
          return callTime >= fromTime && callTime <= toTime;
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

  /**
   * Période de comparaison N-1 dérivée du dateRange courant.
   * `null` pour les ranges d'1 jour (delta non pertinent).
   */
  const previousRange = useMemo(
    () => computePreviousRange(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to]
  );

  /**
   * Fetch des appels de la période précédente — pour calcul des deltas vs N-1
   * sur les tuiles KPI. Pas exécuté si `previousRange` est null (single day).
   * Utilise le mécanisme `from`/`to` existant côté backend.
   */
  useEffect(() => {
    if (!effectiveUserId || !previousRange) {
      setPreviousCalls([]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          userProductId: String(userProductId),
          mode: "all",
          from: previousRange.from.toISOString(),
          to: previousRange.to.toISOString(),
          asUserId: String(effectiveUserId),
        });
        const res = await fetch(`/api/calls?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        const data = await res.json();
        // Mode all renvoie un array (ou { data, previous } si includePrevious).
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setPreviousCalls(list);
      } catch (e) {
        if (!isAbortError(e)) {
          console.error("Erreur fetch appels période précédente :", e);
        }
      }
    })();
    return () => controller.abort();
  }, [effectiveUserId, userProductId, previousRange]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/configuration/mapping/type_exam?userProductId=" + userProductId);
        const data = await response.json();
        setMapping(data);
      } catch (err) {
        if (!isAbortError(err)) {
          console.error("Erreur lors du fetch des appels:", err);
        }
      }
    })();
  }, []);
  
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
              const res = await fetch(`/api/calls?${params.toString()}&mode=all`, {
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
  const nbRDV = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const n = Number(c?.stats?.rdv_booked ?? 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [calls]);
  const nbUrgence = useMemo(() => calls.filter((c) => normalizeReso(c) === "urgence").length, [calls]);
  const nbInfo = useMemo(() => calls.filter((c) => normalizeReso(c) === "info").length, [calls]);

  const indicePerformance = useMemo(() => {
    if (calls.length === 0) return 0;
    return getIndice(calls);
  }, [calls]);

  const heuresPrisEnCharge = useMemo(() => {
    const totalSeconds = sumDurationsSec(calls);
    return formatHoursFromSeconds(totalSeconds);
  }, [calls]);

  // 2ème ligne 
  const annulation = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const n = Number(c?.stats?.rdv_canceled ?? 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [calls]);

  const modification = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const n = Number(c?.stats?.rdv_modified ?? 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [calls]);

  // "Examens non pris en charge" — toute la catégorie examen_non_traitable
  // (exam_type, exam_not_practiced, exam_interv, exam_mult, doppler_*, …),
  // pas seulement exam_type comme avant. Évite la sous-estimation.
  const notPerformed = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const reason = c?.stats?.transferReason;
      if (!reason) return acc;
      const meta = getTransferMeta(reason);
      return acc + (meta.category === "examen_non_traitable" ? 1 : 0);
    }, 0);
  }, [calls]);

  const radioInter = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const n = Number(c.stats?.transferReason == "exam_interv" ? 1 : 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [calls]);

  const noSlotApi = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      const n = Number(c?.stats?.no_slot_api_retrieve ? 1 : 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [calls]);

  const confirmRDV = useMemo(() => {
    return calls.reduce((acc, c: any) => {
      return acc + (c?.stats?.rdv_status === "confirmed" ? 1 : 0);
    }, 0);
  }, [calls]);

  /* ========== KPI période précédente + deltas ==========
   * Mêmes calculs que ci-dessus appliqués à `previousCalls`, puis on dérive
   * les deltas vs courant via `computeDelta` (direction métier par KPI). */
  const previousKpis = useMemo(() => {
    const p = previousCalls;
    return {
      totalAppels: p.length,
      nbRDV: p.reduce(
        (acc, c: any) => acc + (Number(c?.stats?.rdv_booked ?? 0) || 0),
        0
      ),
      nbUrgence: p.filter((c) => normalizeReso(c) === "urgence").length,
      nbInfo: p.filter((c) => normalizeReso(c) === "info").length,
      heuresSec: sumDurationsSec(p),
      annulation: p.reduce(
        (acc, c: any) => acc + (Number(c?.stats?.rdv_canceled ?? 0) || 0),
        0
      ),
      modification: p.reduce(
        (acc, c: any) => acc + (Number(c?.stats?.rdv_modified ?? 0) || 0),
        0
      ),
      notPerformed: p.reduce((acc, c: any) => {
        const r = c?.stats?.transferReason;
        if (!r) return acc;
        return acc + (getTransferMeta(r).category === "examen_non_traitable" ? 1 : 0);
      }, 0),
      radioInter: p.reduce(
        (acc, c: any) => acc + (c.stats?.transferReason === "exam_interv" ? 1 : 0),
        0
      ),
      noSlotApi: p.reduce(
        (acc, c: any) => acc + (c?.stats?.no_slot_api_retrieve ? 1 : 0),
        0
      ),
      confirmRDV: p.reduce(
        (acc, c: any) => acc + (c?.stats?.rdv_status === "confirmed" ? 1 : 0),
        0
      ),
    };
  }, [previousCalls]);

  const currentHeuresSec = useMemo(() => sumDurationsSec(calls), [calls]);

  /**
   * Deltas affichés sur les tuiles. `null` si la plage est d'1 jour
   * (computePreviousRange → null) → pas de badge dans ce cas.
   */
  const deltas = useMemo(() => {
    if (!previousRange) return null;
    return {
      totalAppels: computeDelta(totalAppels, previousKpis.totalAppels, "higher_is_better"),
      nbRDV: computeDelta(nbRDV, previousKpis.nbRDV, "higher_is_better"),
      nbUrgence: computeDelta(nbUrgence, previousKpis.nbUrgence, "neutral"),
      nbInfo: computeDelta(nbInfo, previousKpis.nbInfo, "neutral"),
      heures: computeDelta(currentHeuresSec, previousKpis.heuresSec, "higher_is_better"),
      annulation: computeDelta(annulation, previousKpis.annulation, "neutral"),
      modification: computeDelta(modification, previousKpis.modification, "neutral"),
      notPerformed: computeDelta(notPerformed, previousKpis.notPerformed, "lower_is_better"),
      radioInter: computeDelta(radioInter, previousKpis.radioInter, "neutral"),
      noSlotApi: computeDelta(noSlotApi, previousKpis.noSlotApi, "lower_is_better"),
      confirmRDV: computeDelta(confirmRDV, previousKpis.confirmRDV, "higher_is_better"),
    };
  }, [
    previousRange,
    previousKpis,
    totalAppels,
    nbRDV,
    nbUrgence,
    nbInfo,
    currentHeuresSec,
    annulation,
    modification,
    notPerformed,
    radioInter,
    noSlotApi,
    confirmRDV,
  ]);

  /** Suffixe humain pour le tooltip des deltas (ex: "du 12 mai au 18 mai"). */
  const previousLabel = previousRange?.label ?? "";

  /** Format court d'un delta pour insertion CSV ("+18%" / "-12%" / "=" / "Nouveau" / ""). */
  const formatDeltaForCsv = (d?: DeltaResult): string => {
    if (!d) return "";
    if (d.kind === "insufficient") return "";
    if (d.kind === "equal") return "=";
    if (d.kind === "new") return "Nouveau";
    return `${d.pct > 0 ? "+" : ""}${d.pct}%`;
  };

  /* ========== Heatmap : 4 datasets calculés à la volée ========== */
  type HeatmapMetricKey = "calls" | "rdv" | "planning" | "transfer";
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetricKey>("calls");

  const heatmapAll = useMemo(() => buildHeatmap(calls), [calls]);
  const heatmapRdv = useMemo(
    () =>
      buildHeatmap(calls, (c: any) => Number(c?.stats?.rdv_booked ?? 0) > 0),
    [calls]
  );
  const heatmapPlanning = useMemo(
    () => buildHeatmap(calls, (c: any) => !!c?.stats?.no_slot_api_retrieve),
    [calls]
  );
  const heatmapTransfer = useMemo(
    () => buildHeatmap(calls, (c: any) => isCounterTransfer(c?.stats)),
    [calls]
  );

  const heatmapConfig: Record<
    HeatmapMetricKey,
    {
      label: string;
      shortLabel: string;
      description: string;
      colorRgb: string;
      data: { matrix: number[][]; max: number; total: number };
    }
  > = {
    calls: {
      label: "Appels",
      shortLabel: "appels",
      description: "Volume total d'appels par créneau — repère les heures de pointe",
      colorRgb: "72, 200, 175",
      data: heatmapAll,
    },
    rdv: {
      label: "RDV pris",
      shortLabel: "RDV",
      description: "Quand les RDV se concrétisent — heures les plus productives",
      colorRgb: "34, 197, 94",
      data: heatmapRdv,
    },
    planning: {
      label: "Planning complet",
      shortLabel: "satur.",
      description: "Quand les planning complets explosent — signal d'ouvrir des plages",
      colorRgb: "124, 45, 77",
      data: heatmapPlanning,
    },
    transfer: {
      label: "Transferts secrétariat",
      shortLabel: "transferts",
      description: "Charge du secrétariat par créneau — anticipation des effectifs",
      colorRgb: "239, 68, 68",
      data: heatmapTransfer,
    },
  };
  const currentHeatmap = heatmapConfig[heatmapMetric];

  /**
   * Construit un CSV multi-sections à partir des stats déjà calculées sur la
   * page, puis déclenche le téléchargement. Aucune nouvelle requête : on
   * exporte exactement ce que l'utilisateur voit pour la période sélectionnée.
   */
  const handleExportCsv = () => {
    const rows: Array<Array<unknown> | null> = [];

    // ===== Section : Période =====
    rows.push(["Statistiques d'appels - Export"]);
    rows.push(["Période du", formatDateFr(dateRange.from), "au", formatDateFr(dateRange.to)]);
    if (previousRange) {
      rows.push(["Comparaison avec", previousRange.label]);
    }
    rows.push(["Nombre total d'appels analysés", calls.length]);
    rows.push(null);

    // ===== Section : Indicateurs principaux =====
    rows.push(["INDICATEURS PRINCIPAUX"]);
    rows.push(["Indicateur", "Valeur", "Évolution"]);
    rows.push(["Total d'appels", totalAppels, formatDeltaForCsv(deltas?.totalAppels)]);
    rows.push(["Prises de RDV", nbRDV, formatDeltaForCsv(deltas?.nbRDV)]);
    rows.push(["Urgences détectées", nbUrgence, formatDeltaForCsv(deltas?.nbUrgence)]);
    rows.push(["Informations", nbInfo, formatDeltaForCsv(deltas?.nbInfo)]);
    rows.push(["Heures prises en charge", heuresPrisEnCharge, formatDeltaForCsv(deltas?.heures)]);
    rows.push(["Annulations", annulation, formatDeltaForCsv(deltas?.annulation)]);
    rows.push(["Modifications", modification, formatDeltaForCsv(deltas?.modification)]);
    rows.push(["Examens non pris en charge", notPerformed, formatDeltaForCsv(deltas?.notPerformed)]);
    rows.push(["Planning complet", noSlotApi, formatDeltaForCsv(deltas?.noSlotApi)]);
    rows.push(["Radio interventionnelle", radioInter, formatDeltaForCsv(deltas?.radioInter)]);
    rows.push(["Confirmations RDV", confirmRDV, formatDeltaForCsv(deltas?.confirmRDV)]);
    rows.push(["Indice de performance", `${indicePerformance}/100`]);
    rows.push(null);

    // ===== Section : Transferts par catégorie =====
    rows.push(["RÉPARTITION DES TRANSFERTS PAR CATÉGORIE"]);
    rows.push(["Catégorie", "Nombre"]);
    for (const t of transferData) {
      if ((t as any).name === "Aucune donnée") continue;
      rows.push([(t as any).name, (t as any).value]);
    }
    rows.push(null);

    // ===== Section : Top raisons précises de transfert =====
    if (transferReasonDetail.length > 0) {
      rows.push(["TOP RAISONS PRÉCISES DE TRANSFERT"]);
      rows.push(["Raison", "Catégorie", "Nombre d'appels"]);
      for (const r of transferReasonDetail) {
        rows.push([r.label, r.category, r.count]);
      }
      rows.push(null);
    }

    // ===== Section : Analyse des raccrochages =====
    if (hangupAnalysis.total > 0) {
      rows.push(["ANALYSE DES RACCROCHAGES"]);
      rows.push(["Contexte", "Nombre", "Pourcentage"]);
      for (const h of hangupAnalysis.items) {
        rows.push([h.label, h.count, `${Math.round(h.pct * 10) / 10}%`]);
      }
      rows.push(null);
    }

    // ===== Section : Langues =====
    if (languageData.hasDiversity) {
      rows.push(["RÉPARTITION PAR LANGUE DE CONVERSATION"]);
      rows.push(["Langue", "Nombre d'appels", "Pourcentage"]);
      for (const l of languageData.items) {
        rows.push([l.label, l.count, `${Math.round(l.pct * 10) / 10}%`]);
      }
      rows.push(null);
    }

    // ===== Section : Examens demandés (pour les RDV) =====
    if (examPieData.length > 0) {
      rows.push(["RÉPARTITION DES EXAMENS (RDV PRIS)"]);
      rows.push(["Examen", "Nombre"]);
      for (const e of examPieData) {
        if ((e as any).name === "Aucune donnée") continue;
        rows.push([(e as any).name, (e as any).value]);
      }
      rows.push(null);
    }

    // ===== Section : Heatmap (jour × heure) — métrique courante =====
    rows.push([`HEATMAP - ${currentHeatmap.label.toUpperCase()} (jour × heure)`]);
    const heatmapHeader: unknown[] = ["Jour"];
    for (let h = 0; h < 24; h++) heatmapHeader.push(`${String(h).padStart(2, "0")}h`);
    rows.push(heatmapHeader);
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const row: unknown[] = [HEATMAP_DAYS_FULL[dayIdx]];
      for (let h = 0; h < 24; h++) row.push(currentHeatmap.data.matrix[dayIdx][h]);
      rows.push(row);
    }

    const csv = rowsToCsv(rows);
    const fromStr = isoDateForFilename(dateRange.from);
    const toStr = isoDateForFilename(dateRange.to);
    downloadCsv(`stats-appels_${fromStr}_${toStr}.csv`, csv);
  };

  // 3ème ligne
  const examLabelMap = useMemo(() => {
    if (!mapping) return {};

    const map: Record<string, string> = {};

    if (Array.isArray(mapping)) {
      for (const e of mapping) {
        if (e.id) map[String(e.id)] = e.fr;
        if (e.diminutif) map[e.diminutif] = e.fr;
        if (e.examCode) map[e.examCode] = e.fr;
        if (e.labelFr) map[e.labelFr] = e.fr;
      }
    }

    return map;
  }, [mapping]);

  const examPieData = useMemo(() => {
    const buckets: Record<string, number> = {};

    for (const c of calls as any[]) {
      const rawExam = c?.stats?.exam_type_id;
      const rdv = Number(c?.stats?.rdv_booked ?? 0);

      if (!rawExam || rdv === 0) continue;

      // normaliser en tableau
      const exams = Array.isArray(rawExam) ? rawExam : [rawExam];
      // console.log("rawExam", rawExam, "exams", exams);
      // console.log("examLabelMap", examLabelMap);
      // mapper chaque examen
      const label = exams
        .map((code: string) => examLabelMap[code] ?? code)
        .join(" ");

      if (!buckets[label]) buckets[label] = 0;

      buckets[label] += rdv;
    }

    const arr = Object.entries(buckets).map(([name, value]) => ({
      name,
      value,
    }));

    const sum = arr.reduce((a, b) => a + b.value, 0);

    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [calls, examLabelMap]);

  const examCodes = useMemo(() => {
    const map = new Map<string, { label: string; examCode: string }>();

    for (const c of calls as any[]) {
      const code = c?.stats?.exam_type_id;
      if (!code) continue;

      const codes = Array.isArray(code) ? code : [code];

      codes.forEach((e) => {
        const element = mapping?.find((m: any) => m.diminutif == e);
        if (element && !map.has(element.diminutif)) {
          map.set(element.diminutif, {
            label: element.fr,
            examCode: element.diminutif,
          });
        }
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [calls, mapping]);

  const examCodePieData = useMemo(() => {
    const buckets: Record<string, number> = {};

    for (const c of calls as any[]) {
      const examType = c?.stats?.exam_type_id;
      const examCode = c?.stats?.exam_code;
      const rdv = Number(c?.stats?.rdv_booked ?? 0);

      if (!examType || !examCode || rdv === 0) continue;

      const examTypes = Array.isArray(examType) ? examType : [examType];
      const examCodes = Array.isArray(examCode) ? examCode : [examCode];

      // filtre sur le select
      if (
        selectedExamCode !== "all" &&
        !examTypes.includes(selectedExamCode)
      ) {
        continue;
      }

      // compter les exam_code
      for (const code of examCodes) {
        if (!buckets[code]) buckets[code] = 0;
        buckets[code] += 1;
      }
    }

    const arr = Object.entries(buckets).map(([name, value]) => ({
      name,
      value,
    }));

    const sum = arr.reduce((a, b) => a + b.value, 0);

    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [calls, selectedExamCode]);

  /* ========== Camembert transferts — par CATÉGORIE ==========
   * Comptage : on garde uniquement les "vrais" transferts vers secrétariat
   * (end_reason === 'transfer' ET catégorie ≠ non_transfert). Source de vérité
   * dans `src/lib/transferReasons.ts`. */
  const transferData = useMemo(() => {
    const buckets: Record<TransferCategory, number> = {
      demande_patient: 0,
      examen_non_traitable: 0,
      patient_introuvable: 0,
      incomprehension_etape: 0,
      pas_de_creneau: 0,
      erreur_technique: 0,
      non_transfert: 0,
      autre: 0,
    };

    for (const c of calls) {
      const stats = (c as any)?.stats;
      if (!isCounterTransfer(stats)) continue;
      const meta = getTransferMeta(stats?.transferReason);
      buckets[meta.category]++;
    }

    const arr = CATEGORY_ORDER.filter((cat) => cat !== "non_transfert").map((cat) => ({
      key: cat,
      name: CATEGORY_META[cat].label,
      value: buckets[cat],
      color: CATEGORY_META[cat].color,
    }));

    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1, color: "#9ca3af" }] : arr;
  }, [calls]);

  /* ========== BarChart : top des raisons précises ========== */
  const transferReasonDetail = useMemo(() => {
    const buckets = new Map<string, { reason: string; label: string; category: TransferCategory; count: number }>();
    for (const c of calls) {
      const stats = (c as any)?.stats;
      if (!isCounterTransfer(stats)) continue;
      const reason = stats?.transferReason as string | undefined;
      if (!reason) continue;
      const meta = getTransferMeta(reason);
      const existing = buckets.get(reason);
      if (existing) {
        existing.count++;
      } else {
        buckets.set(reason, {
          reason,
          label: meta.label,
          category: meta.category,
          count: 1,
        });
      }
    }
    return Array.from(buckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [calls]);

  /* ========== Répartition par langue de conversation ==========
   * On n'affiche le widget QUE si on observe au moins UNE langue ≠ "fr" sur la
   * période — sinon (100% français), pas d'intérêt à montrer un graphique
   * monochrome. */
  const languageData = useMemo(() => {
    const buckets = new Map<LanguageCode, number>();
    for (const c of calls as any[]) {
      const lang = (c?.stats?.language as string | undefined) ?? "fr";
      const meta = getLanguageMeta(lang);
      buckets.set(meta.code, (buckets.get(meta.code) ?? 0) + 1);
    }
    const total = Array.from(buckets.values()).reduce((s, v) => s + v, 0);
    const items = Array.from(buckets.entries())
      .map(([code, count]) => ({
        code,
        ...LANGUAGE_META[code],
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const hasDiversity = items.some((i) => i.code !== "fr" && i.count > 0);
    return { items, total, hasDiversity };
  }, [calls]);

  /* ========== Analyse des raccrochages par étape ==========
   * Regroupe les appels "raccroché" (pas de RDV + pas de transfert) selon le
   * `last_state` du bot, pour expliquer pourquoi le patient a abandonné. */
  const hangupAnalysis = useMemo(() => {
    const buckets = new Map<HangupContextKey, number>();
    let total = 0;
    for (const c of calls as any[]) {
      const ctx = getHangupContext(c?.stats);
      if (!ctx) continue;
      total++;
      buckets.set(ctx.key, (buckets.get(ctx.key) ?? 0) + 1);
    }
    const allCtx = [...HANGUP_CONTEXTS, UNKNOWN_HANGUP_CONTEXT];
    const items = allCtx
      .map((ctx) => ({
        key: ctx.key,
        label: ctx.label,
        description: ctx.description,
        color: ctx.color,
        count: buckets.get(ctx.key) ?? 0,
        pct: total > 0 ? ((buckets.get(ctx.key) ?? 0) / total) * 100 : 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return { items, total };
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <DateRangePresets range={dateRange} onChange={setDateRange} />
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
              PaperProps={{
                sx: {
                  borderRadius: 2,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                  border: "1px solid rgba(72,200,175,0.15)",
                },
              }}
            >
              <Box sx={{ p: 2.5, pb: 1 }}>
                <Typography
                  variant="overline"
                  sx={{
                    color: "#2a6f64",
                    fontWeight: 700,
                    letterSpacing: 1,
                    display: "block",
                    mb: 1.5,
                  }}
                >
                  Sélectionner une période
                </Typography>

                <DateRangePicker
                  value={dateRangeDraft}
                  onChange={(range) => {
                    setDateRangeDraft(range);
                  }}
                />
              </Box>
              <Box
                sx={{
                  px: 2.5,
                  py: 1.5,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 1,
                  borderTop: "1px solid #f0f0f0",
                }}
              >
                <Button
                  variant="text"
                  onClick={() => setAnchorEl(null)}
                  sx={{ color: "text.secondary", textTransform: "none" }}
                >
                  Annuler
                </Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    setDateRange(dateRangeDraft);
                    setAnchorEl(null);
                  }}
                  sx={{
                    bgcolor: "#48C8AF",
                    fontWeight: 600,
                    textTransform: "none",
                    "&:hover": { bgcolor: "#3BA992" },
                  }}
                >
                  Appliquer
                </Button>
              </Box>
            </Popover>
          </Box>

          {/* Export CSV — désactivé pendant le chargement ou si aucun appel. */}
          <Button
            variant="outlined"
            startIcon={<IconDownload size={16} />}
            onClick={handleExportCsv}
            disabled={loading || calls.length === 0}
            sx={{
              borderColor: "#48C8AF",
              color: "#48C8AF",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
              textTransform: "none",
            }}
          >
            Télécharger CSV
          </Button>

          <Button
            variant="outlined"
            onClick={() => router.push(`${basePath}`)}
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
              <StatTile
                title="Total d&apos;appels"
                value={totalAppels}
                icon={<IconTotal />}
                delta={deltas?.totalAppels}
                previousLabel={previousLabel}
              />
            ) : i === 1 ? (
              <StatTile
                title="Prises de RDV"
                value={nbRDV}
                icon={<IconRDV />}
                delta={deltas?.nbRDV}
                previousLabel={previousLabel}
              />
            ) : i === 2 ? (
              <StatTile
                title="Urgences détectées"
                value={nbUrgence}
                icon={<IconUrgence />}
                delta={deltas?.nbUrgence}
                previousLabel={previousLabel}
              />
            ) : i === 3 ? (
              <StatTile
                title="Informations"
                value={nbInfo}
                icon={<IconInfo />}
                delta={deltas?.nbInfo}
                previousLabel={previousLabel}
              />
            ) : (
              <StatTile
                title="Heures prises en charge"
                value={heuresPrisEnCharge}
                icon={<IconHeures />}
                delta={deltas?.heures}
                previousLabel={previousLabel}
              />
            )}
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={2.4} key={i}>
            {loading ? (
              <StatTileSkeleton />
            ) : i === 0 ? (
              <StatTileDouble
                items={[
                  {
                    title: "Annulation",
                    value: annulation,
                    delta: deltas?.annulation,
                    previousLabel,
                  },
                  {
                    title: "Modification",
                    value: modification,
                    delta: deltas?.modification,
                    previousLabel,
                  },
                ]}
                icon={<IconAnnulMod />}
              />
            ) : i === 1 ? (
              <StatTile
                title="Examen non pris en charge"
                value={notPerformed == 0 ? "-" : notPerformed}
                icon={<IconExamNotHandled />}
                delta={deltas?.notPerformed}
                previousLabel={previousLabel}
              />
            ) : i === 2 ? (
              <StatTile
                title="Planning complet"
                value={noSlotApi == 0 ? "-" : noSlotApi}
                icon={<IconPlanningFull />}
                delta={deltas?.noSlotApi}
                previousLabel={previousLabel}
              />
            ) : i === 3 ? (
              <StatTile
                title="Demande de radio interventionnel"
                value={radioInter == 0 ? "-" : radioInter}
                icon={<IconRadioInterv />}
                delta={deltas?.radioInter}
                previousLabel={previousLabel}
              />
            ) : (
              <StatTile
                title="Confirmation RDV"
                value={confirmRDV == 0 ? "-" : confirmRDV}
                icon={<IconConfirmRDV />}
                delta={deltas?.confirmRDV}
                previousLabel={previousLabel}
              />
            )}
          </Grid>
        ))}
      </Grid>

      {/* Heatmap horaire × jour de la semaine */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2.5 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              spacing={1.5}
              sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700}>
                  Heatmap d&apos;activité
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {currentHeatmap.description}
                </Typography>
              </Box>
              <Tabs
                value={heatmapMetric}
                onChange={(_, v) => setHeatmapMetric(v as HeatmapMetricKey)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 36,
                  "& .MuiTab-root": {
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: 12,
                    minHeight: 36,
                    py: 0.5,
                    px: 1.5,
                  },
                  "& .Mui-selected": { color: "#2a6f64 !important" },
                  "& .MuiTabs-indicator": {
                    backgroundColor: `rgb(${currentHeatmap.colorRgb})`,
                    height: 2,
                  },
                }}
              >
                {(["calls", "rdv", "planning", "transfer"] as HeatmapMetricKey[]).map((k) => {
                  const c = heatmapConfig[k];
                  return (
                    <Tab
                      key={k}
                      value={k}
                      label={
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <span>{c.label}</span>
                          {c.data.total > 0 && (
                            <Chip
                              size="small"
                              label={c.data.total}
                              sx={{
                                height: 18,
                                fontSize: 10,
                                fontWeight: 700,
                                bgcolor: `rgba(${c.colorRgb}, 0.15)`,
                                color: "#374151",
                              }}
                            />
                          )}
                        </Stack>
                      }
                    />
                  );
                })}
              </Tabs>
            </Stack>

            {loading ? (
              <ChartSkeleton />
            ) : currentHeatmap.data.total === 0 ? (
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
                  Aucune donnée &laquo; {currentHeatmap.label} &raquo; sur la période.
                </Typography>
              </Box>
            ) : (
              <Heatmap
                matrix={currentHeatmap.data.matrix}
                max={currentHeatmap.data.max}
                colorRgb={currentHeatmap.colorRgb}
                metricLabel={currentHeatmap.shortLabel}
              />
            )}
          </Paper>
        </Grid>
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
                      {transferData.map((d: any, i) => (
                        <Cell key={i} fill={d.color || PIE_COLORS[i % PIE_COLORS.length]} />
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

      {/* Détail des raisons précises de transfert (drill-down sous le camembert) */}
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              Top des raisons précises de transfert
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Détail des 12 motifs les plus fréquents — couleur selon la catégorie
            </Typography>
            {loading ? (
              <ChartSkeleton />
            ) : transferReasonDetail.length === 0 ? (
              <Box
                sx={{
                  height: 220,
                  display: "grid",
                  placeItems: "center",
                  border: "1px dashed #e5e7eb",
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Aucun transfert vers secrétariat sur la période.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ width: "100%", height: Math.max(220, transferReasonDetail.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={transferReasonDetail}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#374151" }}
                      axisLine={false}
                      tickLine={false}
                      width={220}
                    />
                    <ReTooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        padding: "6px 10px",
                      }}
                      formatter={(value: any, _name: any, payload: any) => [
                        `${value} appel${(value as number) > 1 ? "s" : ""}`,
                        CATEGORY_META[(payload?.payload?.category ?? "autre") as TransferCategory]
                          ?.label ?? "",
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {transferReasonDetail.map((d, i) => (
                        <Cell key={i} fill={CATEGORY_META[d.category].color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Analyse des raccrochages — par étape du flow où le patient a
          abandonné. Affiché uniquement s'il y a au moins 1 raccroché sur la
          période, sinon pas de valeur ajoutée. */}
      {hangupAnalysis.total > 0 && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="baseline"
                spacing={1}
                sx={{ mb: 0.5, flexWrap: "wrap" }}
              >
                <Typography variant="h6" fontWeight={700}>
                  Analyse des raccrochages
                </Typography>
                <Chip
                  size="small"
                  label={`${hangupAnalysis.total} appel${hangupAnalysis.total > 1 ? "s" : ""}`}
                  sx={{ fontWeight: 600 }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                À quelle étape le patient a-t-il raccroché ? Permet d&apos;expliquer
                certains abandons (créneaux non adaptés, hésitation finale, etc.).
              </Typography>
              <Stack spacing={1.5}>
                {hangupAnalysis.items.map((ctx) => (
                  <Box key={ctx.key}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ mb: 0.5 }}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: ctx.color,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" fontWeight={700} sx={{ display: "block" }}>
                          {ctx.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", fontSize: 11, lineHeight: 1.35 }}
                        >
                          {ctx.description}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {ctx.count} ({Math.round(ctx.pct * 10) / 10}%)
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
                          width: `${ctx.pct}%`,
                          height: "100%",
                          bgcolor: ctx.color,
                          transition: "width 400ms ease",
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Répartition par langue — affichée uniquement s'il y a au moins une
          autre langue que le français sur la période (sinon graphique vide). */}
      {languageData.hasDiversity && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                Répartition par langue de conversation
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Langue effective en fin d&apos;appel — détection auto ou question explicite
              </Typography>
              <Stack spacing={1.5}>
                {languageData.items.map((lang) => (
                  <Box key={lang.code}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ mb: 0.5 }}
                    >
                      <Typography variant="body2" sx={{ fontSize: 16 }}>
                        {lang.flag}
                      </Typography>
                      <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
                        {lang.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lang.count} appel{lang.count > 1 ? "s" : ""} (
                        {Math.round(lang.pct * 10) / 10}%)
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
                          width: `${lang.pct}%`,
                          height: "100%",
                          bgcolor: lang.color,
                          transition: "width 400ms ease",
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Répartition des examens
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Pour les prises de rendez-vous
            </Typography>

            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={examPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {examPieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
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
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Répartition par code examen
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Filtrer par type d&apos;examen
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Select
                size="small"
                value={selectedExamCode}
                onChange={(e) => setSelectedExamCode(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="all">Tous les examens</MenuItem>
                {examCodes.map(({ examCode, label }) => (
                  <MenuItem key={examCode} value={examCode}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {loading ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={examCodePieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {examCodePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>

                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      wrapperStyle={{
                        maxHeight: 200,
                        overflowY: "auto",
                        fontSize: 12,
                        width: 200
                      }}
                    />
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

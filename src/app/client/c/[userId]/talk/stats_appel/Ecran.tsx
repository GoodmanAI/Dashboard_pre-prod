"use client";

import SectionHeader from "@/components/admin/SectionHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Popover,
  Select,
  MenuItem,
  Stack,
  Chip,
  Tab,
  Tabs,
  Alert,
} from "@mui/material";
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
  Assignment as IconResultats,
} from "@mui/icons-material";
import { useCentre } from "@/app/context/CentreContext";
import { subDays, startOfDay, endOfDay } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import DateRangePresets from "@/components/DateRangePresets";
import {
  ChartSkeleton,
  StatTile,
  StatTileDouble,
  StatTileSkeleton,
} from "@/components/shared/stats/StatTile";
import { HEATMAP_DAYS_FULL, Heatmap } from "@/components/shared/stats/Heatmap";
import { useFiltresRecherche } from "@/lib/recherche/integre";
import { plageDePeriode } from "@/lib/recherche/periode";
import {
  TransferCategory,
  CATEGORY_META,
  CATEGORY_ORDER,
} from "@/lib/transferReasons";
import { LANGUAGE_META, LanguageCode } from "@/lib/languages";
import { construireExamLabelMap, listerTypesExamen } from "@/lib/examLabels";
import {
  HANGUP_CONTEXTS,
  UNKNOWN_HANGUP_CONTEXT,
} from "@/lib/hangupContext";
import {
  computeDelta,
  computePreviousRange,
  DeltaResult,
} from "@/lib/deltaCompare";
import {
  rowsToCsv,
  downloadCsv,
  isoDateForFilename,
  formatDateFr,
} from "@/lib/csvExport";
import { IconDownload } from "@tabler/icons-react";
import { MENU_FILTRE } from "@/lib/menuFiltre";
import { useRechargement, styleRechargement } from "@/hooks/useRechargement";
import BarreRechargement from "@/components/shared/stats/BarreRechargement";
import { signaler } from "@/lib/signaler";
import {
  calculerStatsAppels,
  IndicateursAppels,
  RESO_KEYS,
  ResoKey,
  StatsAppels,
} from "@/lib/statsAppel";

/* =========================================================
   Types & utils
========================================================= */

const NEEDLE_BASE_RADIUS_PX = 5;
const NEEDLE_COLOR = "#d0d000";

const PALETTE = {
  cyan: "#37D2D2",
  green: "#37D253",
  blue: "#1976D2",
  purple: "#6237D2",
  pink: "#D237C2",
  teal: "#2FB9A6",
  lime: "#9AD237",
  indigo: "#3F37D2",
  violet: "#9A37D2",
  coral: "#D25A37",
  amber: "#D2A237",
  grey: "#838383",
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

/** Résultat de `GET /api/stats-appel`. */
type ReponseStats = { courant: StatsAppels; precedent: IndicateursAppels | null };

/** Résultat vide, avant le premier chargement (et période sans appel). */
const VIDE: StatsAppels = calculerStatsAppels([]);

/* =========================================================
   Page principale
========================================================= */

/** Ancres de la recherche centrale sur la première rangée de tuiles (`catalogue.ts`). */
const ANCRES_TUILES = [
  "total_appels",
  "prises_de_rdv",
  "urgences",
  "informations",
  "demandes_de_resultats",
  "heures",
];

/** Et sur la seconde rangée. */
const ANCRES_TUILES_BAS = [
  "annulations",
  "non_pris_en_charge",
  "sans_creneau",
  "interventionnel",
  "confirmations",
];

export default function StatsAppelPage({ params }: any) {
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const [mapping, setMapping]: any = useState(null);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { centres, selectedUserId } = useCentre();
  const [selectedExamCode, setSelectedExamCode] = useState<string | "all">(
    "all",
  );
  // Les agrégats calculés par le serveur (`GET /api/stats-appel`, 16/11/2026) : l'écran ne
  // reçoit plus les lignes d'appel. `VIDE` tient lieu de résultat avant le premier chargement.
  const [resultat, setResultat] = useState<ReponseStats>({ courant: VIDE, precedent: null });
  const [erreurStats, setErreurStats] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { premier: premierChargement, recharge } = useRechargement(loading);

  // Date range state - CORRIGÉ : déplacé avant les useEffect
  // Période posée par la recherche (panneau ou lien « Ouvrir l'écran complet »).
  const filtresRecherche = useFiltresRecherche();
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const plage = plageDePeriode(filtresRecherche.periode);
    if (plage) return plage;
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: endOfDay(today),
    };
  });
  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);
  const reqSeqRef = useRef(0);

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

  /**
   * Période de comparaison N-1 dérivée du dateRange courant.
   * `null` pour les ranges d'1 jour (delta non pertinent).
   */
  const previousRange = useMemo(
    () => computePreviousRange(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to],
  );

  // Une requête pour la période et sa période de comparaison. Le serveur lit les appels et
  // renvoie les seuls agrégats (`/api/stats-appel`, 16/11/2026) : avant, l'écran recevait
  // chaque ligne des deux périodes (plusieurs Mo pour 30 jours) et calculait lui-même.
  useEffect(() => {
    if (status !== "authenticated") return;

    const seq = ++reqSeqRef.current;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);

        // Date minimum : toujours 00:00. Date maximum : maintenant si c'est aujourd'hui,
        // sinon la fin de la journée.
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(dateRange.to);
        const nowDate = new Date();
        if (toDate.toDateString() === nowDate.toDateString()) {
          toDate.setTime(nowDate.getTime());
        } else {
          toDate.setHours(23, 59, 59, 999);
        }

        const params = new URLSearchParams({
          userProductId: String(userProductId),
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        });
        if (previousRange) {
          params.set("previousFrom", previousRange.from.toISOString());
          params.set("previousTo", previousRange.to.toISOString());
        }

        const res = await fetch(`/api/stats-appel?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`stats-appel ${res.status}`);
        const reponse = (await res.json()) as ReponseStats;
        if (reqSeqRef.current !== seq) return;
        setResultat(reponse);
        setErreurStats(null);
      } catch (e) {
        if (!isAbortError(e)) {
          signaler("Statistiques d'appels :", e);
          if (reqSeqRef.current === seq)
            setErreurStats(
              "Les statistiques n'ont pas pu être chargées. Vérifiez votre connexion puis rechargez la page.",
            );
        }
      } finally {
        if (reqSeqRef.current === seq) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [status, dateRange, previousRange, userProductId]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(
          "/api/configuration/mapping/type_exam?userProductId=" + userProductId,
        );
        const data = await response.json();
        setMapping(data);
      } catch (err) {
        if (!isAbortError(err)) {
          signaler("Erreur lors du fetch des appels:", err);
        }
      }
    })();
  }, []);

  /* ========== Stats no-show (rappels SMS AI2Xplore) ==========
   * Fetch /api/rdv/stats?userProductId=X&from=YYYY-MM-DD&to=YYYY-MM-DD pour
   * la période courante ET la période précédente (deltas). Les compteurs sont
   * ensuite ajoutés aux tuiles Annulation / Confirmation RDV pour afficher le
   * total (bot + rappel SMS) avec la ventilation en sub-detail. */
  const [noshowStats, setNoshowStats] = useState<{
    totals: { smsSent: number; confirmed: number; cancelled: number };
  } | null>(null);
  const [previousNoshowStats, setPreviousNoshowStats] = useState<{
    totals: { smsSent: number; confirmed: number; cancelled: number };
  } | null>(null);

  const rangeIsoDays = useMemo(() => {
    const f = new Date(dateRange.from);
    const t = new Date(dateRange.to);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    return { from: iso(f), to: iso(t) };
  }, [dateRange]);

  useEffect(() => {
    if (!effectiveUserId) {
      setNoshowStats(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const url =
          `/api/rdv/stats?userProductId=${userProductId}` +
          `&from=${rangeIsoDays.from}&to=${rangeIsoDays.to}`;
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setNoshowStats(null);
          return;
        }
        const data = await res.json();
        setNoshowStats(data);
      } catch (e) {
        if (!isAbortError(e)) {
          signaler("Erreur fetch no-show stats:", e);
        }
      }
    })();
    return () => controller.abort();
  }, [effectiveUserId, userProductId, rangeIsoDays.from, rangeIsoDays.to]);

  useEffect(() => {
    if (!effectiveUserId || !previousRange) {
      setPreviousNoshowStats(null);
      return;
    }
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    const from = iso(previousRange.from);
    const to = iso(previousRange.to);
    const controller = new AbortController();
    (async () => {
      try {
        const url =
          `/api/rdv/stats?userProductId=${userProductId}` +
          `&from=${from}&to=${to}`;
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setPreviousNoshowStats(null);
          return;
        }
        const data = await res.json();
        setPreviousNoshowStats(data);
      } catch (e) {
        if (!isAbortError(e)) {
          signaler("Erreur fetch no-show stats (période précédente):", e);
        }
      }
    })();
    return () => controller.abort();
  }, [effectiveUserId, userProductId, previousRange]);

  /* ========== Stats tuiles ========== (calculées par le serveur, `src/lib/statsAppel.ts`) */
  const courant = resultat.courant;
  const ind = courant.indicateurs;
  const totalAppels = ind.totalAppels;
  const nbRDV = ind.nbRDV;
  const nbUrgence = ind.nbUrgence;
  const nbInfo = ind.nbInfo;
  const indicePerformance = ind.indicePerformance;
  const heuresPrisEnCharge = formatHoursFromSeconds(ind.heuresSec);
  const annulation = ind.annulation;
  const modification = ind.modification;
  const notPerformed = ind.notPerformed;
  const radioInter = ind.radioInter;
  const noSlotApi = ind.noSlotApi;
  const confirmRDV = ind.confirmRDV;
  const nbTransferts = ind.nbTransferts;
  const nbResultats = ind.resultats;
  const partResultats =
    nbTransferts > 0 ? Math.round((nbResultats / nbTransferts) * 100) : 0;

  /* ========== Enrichissement Annulation / Confirmation avec rappels SMS ==========
   * On additionne les compteurs bot LyraeTalk (calculés ci-dessus depuis
   * `calls`) et les compteurs no-show AI2Xplore (fetchés depuis /api/rdv/stats).
   * La tuile affiche le TOTAL en grand ; le breakdown "bot + SMS" est passé en
   * subDetail. Les deltas plus bas comparent bien totals ↔ totals N-1. */
  const smsCancelled = noshowStats?.totals?.cancelled ?? 0;
  const smsConfirmed = noshowStats?.totals?.confirmed ?? 0;
  const totalAnnulation = annulation + smsCancelled;
  const totalConfirmRDV = confirmRDV + smsConfirmed;

  const prevSmsCancelled = previousNoshowStats?.totals?.cancelled ?? 0;
  const prevSmsConfirmed = previousNoshowStats?.totals?.confirmed ?? 0;

  /* ========== KPI période précédente + deltas ==========
   * Mêmes calculs sur la période précédente, faits par le serveur ; les deltas sont dérivés
   * ici via `computeDelta` (direction métier par KPI). */
  const previousKpis = resultat.precedent ?? VIDE.indicateurs;
  const currentHeuresSec = ind.heuresSec;

  /**
   * Deltas affichés sur les tuiles. `null` si la plage est d'1 jour
   * (computePreviousRange → null) → pas de badge dans ce cas.
   */
  const deltas = useMemo(() => {
    if (!previousRange) return null;
    return {
      totalAppels: computeDelta(
        totalAppels,
        previousKpis.totalAppels,
        "higher_is_better",
      ),
      nbRDV: computeDelta(nbRDV, previousKpis.nbRDV, "higher_is_better"),
      nbUrgence: computeDelta(nbUrgence, previousKpis.nbUrgence, "neutral"),
      nbInfo: computeDelta(nbInfo, previousKpis.nbInfo, "neutral"),
      resultats: computeDelta(nbResultats, previousKpis.resultats, "neutral"),
      heures: computeDelta(
        currentHeuresSec,
        previousKpis.heuresSec,
        "higher_is_better",
      ),
      // Annulation & Confirmation : les tuiles affichent le TOTAL (bot + SMS
      // rappel), donc le delta doit comparer total ↔ total N-1 pour rester
      // cohérent avec la valeur affichée.
      annulation: computeDelta(
        totalAnnulation,
        previousKpis.annulation + prevSmsCancelled,
        "neutral",
      ),
      modification: computeDelta(
        modification,
        previousKpis.modification,
        "neutral",
      ),
      notPerformed: computeDelta(
        notPerformed,
        previousKpis.notPerformed,
        "lower_is_better",
      ),
      radioInter: computeDelta(radioInter, previousKpis.radioInter, "neutral"),
      noSlotApi: computeDelta(
        noSlotApi,
        previousKpis.noSlotApi,
        "lower_is_better",
      ),
      confirmRDV: computeDelta(
        totalConfirmRDV,
        previousKpis.confirmRDV + prevSmsConfirmed,
        "higher_is_better",
      ),
    };
  }, [
    previousRange,
    previousKpis,
    totalAppels,
    nbRDV,
    nbUrgence,
    nbInfo,
    nbResultats,
    currentHeuresSec,
    totalAnnulation,
    prevSmsCancelled,
    modification,
    notPerformed,
    radioInter,
    noSlotApi,
    totalConfirmRDV,
    prevSmsConfirmed,
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

  const heatmapAll = courant.cartes.calls;
  const heatmapRdv = courant.cartes.rdv;
  const heatmapPlanning = courant.cartes.planning;
  const heatmapTransfer = courant.cartes.transfer;

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
      description:
        "Volume total d'appels par créneau, repère les heures de pointe",
      colorRgb: "72, 200, 175",
      data: heatmapAll,
    },
    rdv: {
      label: "RDV pris",
      shortLabel: "RDV",
      description: "Quand les RDV se concrétisent, heures les plus productives",
      colorRgb: "34, 197, 94",
      data: heatmapRdv,
    },
    planning: {
      label: "Planning complet",
      shortLabel: "satur.",
      description:
        "Quand les planning complets explosent, signal d'ouvrir des plages",
      colorRgb: "124, 45, 77",
      data: heatmapPlanning,
    },
    transfer: {
      label: "Transferts secrétariat",
      shortLabel: "transferts",
      description:
        "Charge du secrétariat par créneau, anticipation des effectifs",
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
    rows.push([
      "Période du",
      formatDateFr(dateRange.from),
      "au",
      formatDateFr(dateRange.to),
    ]);
    if (previousRange) {
      rows.push(["Comparaison avec", previousRange.label]);
    }
    rows.push(["Nombre total d'appels analysés", totalAppels]);
    rows.push(null);

    // ===== Section : Indicateurs principaux =====
    rows.push(["INDICATEURS PRINCIPAUX"]);
    rows.push(["Indicateur", "Valeur", "Évolution"]);
    rows.push([
      "Total d'appels",
      totalAppels,
      formatDeltaForCsv(deltas?.totalAppels),
    ]);
    rows.push(["Prises de RDV", nbRDV, formatDeltaForCsv(deltas?.nbRDV)]);
    rows.push([
      "Urgences détectées",
      nbUrgence,
      formatDeltaForCsv(deltas?.nbUrgence),
    ]);
    rows.push(["Informations", nbInfo, formatDeltaForCsv(deltas?.nbInfo)]);
    rows.push([
      "Demandes de résultats",
      nbResultats,
      formatDeltaForCsv(deltas?.resultats),
    ]);
    rows.push([
      "Demandes de résultats (part des transferts)",
      `${partResultats}%`,
    ]);
    rows.push([
      "Heures prises en charge",
      heuresPrisEnCharge,
      formatDeltaForCsv(deltas?.heures),
    ]);
    rows.push([
      "Annulations (total)",
      totalAnnulation,
      formatDeltaForCsv(deltas?.annulation),
    ]);
    rows.push(["Annulations (bot LyraeTalk)", annulation]);
    rows.push(["Annulations (rappel SMS)", smsCancelled]);
    rows.push([
      "Modifications",
      modification,
      formatDeltaForCsv(deltas?.modification),
    ]);
    rows.push([
      "Examens non pris en charge",
      notPerformed,
      formatDeltaForCsv(deltas?.notPerformed),
    ]);
    rows.push([
      "Planning complet",
      noSlotApi,
      formatDeltaForCsv(deltas?.noSlotApi),
    ]);
    rows.push([
      "Radio interventionnelle",
      radioInter,
      formatDeltaForCsv(deltas?.radioInter),
    ]);
    rows.push([
      "Confirmations RDV (total)",
      totalConfirmRDV,
      formatDeltaForCsv(deltas?.confirmRDV),
    ]);
    rows.push(["Confirmations RDV (bot LyraeTalk)", confirmRDV]);
    rows.push(["Confirmations RDV (rappel SMS)", smsConfirmed]);
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
    rows.push([
      `HEATMAP - ${currentHeatmap.label.toUpperCase()} (jour × heure)`,
    ]);
    const heatmapHeader: unknown[] = ["Jour"];
    for (let h = 0; h < 24; h++)
      heatmapHeader.push(`${String(h).padStart(2, "0")}h`);
    rows.push(heatmapHeader);
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const row: unknown[] = [HEATMAP_DAYS_FULL[dayIdx]];
      for (let h = 0; h < 24; h++)
        row.push(currentHeatmap.data.matrix[dayIdx][h]);
      rows.push(row);
    }

    const csv = rowsToCsv(rows);
    const fromStr = isoDateForFilename(dateRange.from);
    const toStr = isoDateForFilename(dateRange.to);
    downloadCsv(`stats-appels_${fromStr}_${toStr}.csv`, csv);
  };

  // 3ème ligne
  // Le libellé vient du code canonique de la ligne, pas de la colonne `fr`
  // stockée : voir `src/lib/examLabels.ts`.
  const examLabelMap = useMemo(
    () => construireExamLabelMap(mapping),
    [mapping],
  );

  // Examens des RDV pris : le serveur rend les codes bruts, l'écran pose les libellés du
  // centre (et réunit deux combinaisons de codes qui portent le même libellé).
  const examPieData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const e of courant.examens) {
      const label = e.codes.map((code) => examLabelMap[code] ?? code).join(" ");
      buckets[label] = (buckets[label] ?? 0) + e.rdv;
    }
    const arr = Object.entries(buckets).map(([name, value]) => ({ name, value }));
    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [courant.examens, examLabelMap]);

  // Les types d'examen effectivement présents dans les appels de la période.
  // On part des types déclarés par le centre, et on ne garde que ceux qu'on a
  // vus, pour ne pas offrir un filtre qui ne renverrait rien.
  const examCodes = useMemo(() => {
    const vus = new Set<string>(courant.typesVus);
    return listerTypesExamen(mapping)
      .filter((o) => vus.has(o.valeur) || vus.has(o.code))
      .map((o) => ({ label: o.label, examCode: o.valeur }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [courant.typesVus, mapping]);

  const examCodePieData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const e of courant.codesExamen) {
      // filtre sur le select
      if (selectedExamCode !== "all" && !e.types.includes(selectedExamCode)) continue;
      buckets[e.code] = (buckets[e.code] ?? 0) + e.n;
    }
    const arr = Object.entries(buckets).map(([name, value]) => ({ name, value }));
    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [courant.codesExamen, selectedExamCode]);

  /* ========== Camembert transferts — par CATÉGORIE ==========
   * Comptage : on garde uniquement les "vrais" transferts vers secrétariat
   * (estUnTransfert ET catégorie ≠ non_transfert). Source de vérité
   * dans `src/lib/transferReasons.ts`. */
  const transferData = useMemo(() => {
    const arr = CATEGORY_ORDER.filter((cat) => cat !== "non_transfert").map(
      (cat) => ({
        key: cat,
        name: CATEGORY_META[cat].label,
        value: courant.transferts[cat] ?? 0,
        color: CATEGORY_META[cat].color,
      }),
    );
    const sum = arr.reduce((a, b) => a + b.value, 0);
    return sum === 0
      ? [{ name: "Aucune donnée", value: 1, color: "#9ca3af" }]
      : arr;
  }, [courant.transferts]);

  /* ========== BarChart : top des raisons précises ========== */
  const transferReasonDetail = courant.raisonsTransfert;

  /* ========== Répartition par langue de conversation ==========
   * On n'affiche le widget QUE si on observe au moins UNE langue ≠ "fr" sur la
   * période — sinon (100% français), pas d'intérêt à montrer un graphique
   * monochrome. */
  const languageData = useMemo(() => {
    const total = courant.langues.reduce((s, l) => s + l.count, 0);
    const items = courant.langues
      .map(({ code, count }) => ({
        code,
        ...LANGUAGE_META[code as LanguageCode],
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const hasDiversity = items.some((i) => i.code !== "fr" && i.count > 0);
    return { items, total, hasDiversity };
  }, [courant.langues]);

  /* ========== Analyse des raccrochages par étape ==========
   * Regroupe les appels "raccroché" (pas de RDV + pas de transfert) selon le
   * `last_state` du bot, pour expliquer pourquoi le patient a abandonné. */
  const hangupAnalysis = useMemo(() => {
    const total = courant.raccrochagesTotal;
    const parCle = new Map(courant.raccrochages.map((r) => [r.cle, r.count]));
    const allCtx = [...HANGUP_CONTEXTS, UNKNOWN_HANGUP_CONTEXT];
    const items = allCtx
      .map((ctx) => ({
        key: ctx.key,
        label: ctx.label,
        description: ctx.description,
        color: ctx.color,
        count: parCle.get(ctx.key) ?? 0,
        pct: total > 0 ? ((parCle.get(ctx.key) ?? 0) / total) * 100 : 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return { items, total };
  }, [courant.raccrochages, courant.raccrochagesTotal]);

  /* ========== Camembert (intent) ========== */
  const pieData = useMemo(() => {
    const b = courant.resolutions;
    const arr = [
      { name: "Prise de RDV", value: b.rdv },
      { name: "Informations", value: b.info },
      { name: "Modifications", value: b.modification },
      { name: "Annulations", value: b.annulation },
      { name: "Urgences", value: b.urgence },
    ];
    const sum = arr.reduce((a, c) => a + c.value, 0);
    return sum === 0 ? [{ name: "Aucune donnée", value: 1 }] : arr;
  }, [courant.resolutions]);

  /* ========== Histogramme ========== */
  const histogramData = useMemo(
    () =>
      courant.histogramme.map(({ jour, total, redirect }) => ({
        name: `${jour.slice(8, 10)}/${jour.slice(5, 7)}`,
        normal: total - redirect,
        redirect,
      })),
    [courant.histogramme],
  );

  function HistogramTooltip({ active, payload, label }: any) {
    if (!active || !payload || !payload.length) return null;

    const normal = payload.find((p: any) => p.dataKey === "normal")?.value ?? 0;
    const redirect =
      payload.find((p: any) => p.dataKey === "redirect")?.value ?? 0;
    const total = (Number(normal) || 0) + (Number(redirect) || 0);

    return (
      <Paper sx={{ p: 1.25 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
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
    const diff = (dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay;

    return Math.max(1, Math.ceil(diff) + 1);
  }, [dateRange]);

  /* ========== Activité horaire ========== (heure de Paris, comptée par le serveur) */
  const hourlyActivity = useMemo(
    () =>
      courant.parHeure.map((cnt, h) => ({
        hour: `${String(h).padStart(2, "0")}h`,
        value: Number((cnt / nbDays).toFixed(2)),
      })),
    [courant.parHeure, nbDays],
  );

  /* ========== Durée moyenne par intention ========== */
  const avgByIntentData = useMemo(() => {
    const label: Record<ResoKey, string> = {
      rdv: "RDV",
      info: "Informations",
      modification: "Modifications",
      annulation: "Annulations",
      urgence: "Urgences",
    };
    return RESO_KEYS.map((k) => {
      const { total, n } = courant.dureesParIntention[k];
      const avgSec = n ? total / n : 0;
      return {
        name: label[k],
        avgMin: Number((avgSec / 60).toFixed(1)),
        avgSec,
      };
    }).filter((r) => r.avgSec > 0);
  }, [courant.dureesParIntention]);

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
            // La jauge est la seule figure qui s'anime : un remplissage court, une fois.
            isAnimationActive
            animationDuration={500}
            animationEasing="ease-out"
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
    <Box sx={styleRechargement(recharge)} aria-busy={loading}>
      <BarreRechargement visible={recharge} />
      <SectionHeader
        title="Statistiques d'appels"
        subtitle="Ce que LyraeTalk a fait des appels du centre, sur la période de votre choix."
        retour={{ libelle: "Retour à LyraeTalk", href: basePath }}
      />
      {/* Barre d'outils : période et export */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <DateRangePresets
            range={dateRange}
            onChange={setDateRange}
            douzeMois
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={(e) => setAnchorEl(e.currentTarget)}
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
                  sx={{ color: "text.secondary" }}
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
                    bgcolor: "var(--accent)",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "var(--accent-press)" },
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
            disabled={loading || totalAppels === 0}
            sx={{
              borderColor: "var(--accent)",
              color: "var(--accent)",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
            }}
          >
            Télécharger CSV
          </Button>
        </Box>
      </Box>

      {erreurStats && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erreurStats}
        </Alert>
      )}

      {/* 6 tuiles */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={i} id={ANCRES_TUILES[i]}>
            {premierChargement ? (
              <StatTileSkeleton />
            ) : i === 0 ? (
              <StatTile
                title="Total d'appels"
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
            ) : i === 4 ? (
              <StatTile
                title="Demandes de résultats"
                value={nbResultats === 0 ? "-" : nbResultats}
                icon={<IconResultats />}
                delta={deltas?.resultats}
                previousLabel={previousLabel}
                subDetail={
                  nbResultats > 0
                    ? `${partResultats} % des transferts`
                    : undefined
                }
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
          <Grid item xs={12} sm={6} md={2.4} key={i} id={ANCRES_TUILES_BAS[i]}>
            {premierChargement ? (
              <StatTileSkeleton />
            ) : i === 0 ? (
              <StatTileDouble
                items={[
                  {
                    title: "Annulation",
                    value: totalAnnulation,
                    delta: deltas?.annulation,
                    previousLabel,
                    subDetail:
                      smsCancelled > 0
                        ? `${annulation} + ${smsCancelled} (Rappel SMS)`
                        : undefined,
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
                value={totalConfirmRDV === 0 ? "-" : totalConfirmRDV}
                icon={<IconConfirmRDV />}
                delta={deltas?.confirmRDV}
                previousLabel={previousLabel}
                subDetail={
                  smsConfirmed > 0
                    ? `${confirmRDV} + ${smsConfirmed} (Rappel SMS)`
                    : undefined
                }
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
              {/* Toute la largeur sur un téléphone : en colonne, la boîte prenait la
                  largeur de son contenu et le sous-titre sortait du cadre. */}
              <Box
                sx={{ flex: 1, minWidth: 0, width: { xs: "100%", sm: "auto" } }}
              >
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
                allowScrollButtonsMobile
                sx={{
                  maxWidth: "100%",
                  minHeight: 36,
                  "& .MuiTab-root": {
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
                {(
                  ["calls", "rdv", "planning", "transfer"] as HeatmapMetricKey[]
                ).map((k) => {
                  const c = heatmapConfig[k];
                  return (
                    <Tab
                      key={k}
                      value={k}
                      label={
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.75}
                        >
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

            {premierChargement ? (
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
                  Aucune donnée &laquo; {currentHeatmap.label} &raquo; sur la
                  période.
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
              Correspond au pourcentage d&apos;appel où l&apos;IA a réussi à
              diriger le patient
            </Typography>
            {premierChargement ? (
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
            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals />
                    <ReTooltip content={<HistogramTooltip />} />
                    <Bar isAnimationActive={false} dataKey="normal" stackId="calls" fill={PALETTE.cyan} />
                    <Bar isAnimationActive={false}
                      dataKey="redirect"
                      stackId="calls"
                      fill={PALETTE.pink}
                    />
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
            {premierChargement ? (
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
                    <Bar isAnimationActive={false}
                      dataKey="value"
                      name="Appels moyens / h"
                      fill={PALETTE.cyan}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* 3 blocs supplémentaires */}
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={4} id="transferts">
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Raison du transfert
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Sur la période sélectionnée
            </Typography>
            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false}
                      data={transferData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {transferData.map((d: any, i) => (
                        <Cell
                          key={i}
                          fill={d.color || PIE_COLORS[i % PIE_COLORS.length]}
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

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" fontWeight={700}>
              Durée moyenne par intention
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Moyenne sur la période sélectionnée
            </Typography>
            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={avgByIntentData}
                    layout="vertical"
                    margin={{ left: 32 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" />
                    <ReTooltip
                      formatter={(
                        _val: number,
                        _name: string,
                        payload: any,
                      ) => {
                        const secs = payload?.payload?.avgSec || 0;
                        return [secondsToMinLabel(secs), "Durée moyenne"];
                      }}
                      labelFormatter={() => ""}
                    />
                    <Bar isAnimationActive={false}
                      dataKey="avgMin"
                      name="Durée moyenne"
                      fill={PALETTE.blue}
                    />
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
            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false}
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
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
              Détail des 12 motifs les plus fréquents, couleur selon la
              catégorie
            </Typography>
            {premierChargement ? (
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
              <Box
                sx={{
                  width: "100%",
                  height: Math.max(220, transferReasonDetail.length * 32),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={transferReasonDetail}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="#f3f4f6"
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
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
                        CATEGORY_META[
                          (payload?.payload?.category ??
                            "autre") as TransferCategory
                        ]?.label ?? "",
                      ]}
                    />
                    <Bar isAnimationActive={false} dataKey="count" radius={[0, 4, 4, 0]}>
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
                À quelle étape le patient a-t-il raccroché ? Permet
                d&apos;expliquer certains abandons (créneaux non adaptés,
                hésitation finale, etc.).
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
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          sx={{ display: "block" }}
                        >
                          {ctx.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: "block",
                            fontSize: 11,
                            lineHeight: 1.35,
                          }}
                        >
                          {ctx.description}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ flexShrink: 0 }}
                      >
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
                          width: "100%",
                          height: "100%",
                          bgcolor: ctx.color,
                          transform: `scaleX(${Math.min(100, Math.max(0, ctx.pct)) / 100})`,
                          transformOrigin: "left",
                          transition: "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)",
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
                Langue effective en fin d&apos;appel, détection auto ou question
                explicite
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
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ flex: 1 }}
                      >
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
                          width: "100%",
                          height: "100%",
                          bgcolor: lang.color,
                          transform: `scaleX(${Math.min(100, Math.max(0, lang.pct)) / 100})`,
                          transformOrigin: "left",
                          transition: "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)",
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

            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false}
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
                MenuProps={MENU_FILTRE}
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

            {premierChargement ? (
              <ChartSkeleton />
            ) : (
              <Box sx={{ width: "100%", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false}
                      data={examCodePieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {examCodePieData.map((_, i) => (
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
                        maxHeight: 200,
                        overflowY: "auto",
                        fontSize: 12,
                        width: 200,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics-internal
 *
 * Agrège les `stats.internal` envoyés par le bot Lyrae sur l'ensemble des
 * appels filtrés (période, site, statut RDV). Retourne une structure prête à
 * consommer côté UI — aucune logique d'agrégation côté frontend.
 *
 * Filtres (query) :
 *  - from, to (ISO date) — fenêtre temporelle, defaults : 7 derniers jours
 *  - userProductId (number) — filtre un seul site (legacy, conservé pour compat)
 *  - userProductIds (string CSV "1,2,3") — filtre plusieurs sites (prioritaire)
 *  - rdv_status (string) — filtre sur stats.rdv_status (success / no_slot / ...)
 *
 * Réservé aux ADMIN.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const { searchParams } = req.nextUrl;

  // ---------- Filtres ----------
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const userProductIdParam = searchParams.get("userProductId");
  const userProductIdsParam = searchParams.get("userProductIds");
  const rdvStatusParam = searchParams.get("rdv_status");

  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(toParam) : new Date();

  const whereClause: any = {
    createdAt: { gte: from, lte: to },
  };

  // userProductIds (CSV) prioritaire sur userProductId (legacy)
  if (userProductIdsParam) {
    const ids = userProductIdsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (ids.length > 0) whereClause.userProductId = { in: ids };
  } else if (userProductIdParam) {
    const upid = Number(userProductIdParam);
    if (Number.isFinite(upid)) whereClause.userProductId = upid;
  }

  if (rdvStatusParam && rdvStatusParam !== "all") {
    whereClause.stats = { path: ["rdv_status"], equals: rdvStatusParam };
  }

  // ---------- Fetch ----------
  let calls: any[] = [];
  try {
    calls = await prisma.callConversation.findMany({
      where: whereClause,
      select: { id: true, createdAt: true, stats: true, userProductId: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("analytics-internal fetch error:", err);
    return NextResponse.json({ error: "Erreur fetch" }, { status: 500 });
  }

  // Filtre les appels qui contiennent un `stats.internal`
  const withInternal = calls
    .map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      userProductId: c.userProductId,
      internal: (c.stats as any)?.internal,
    }))
    .filter((c) => c.internal && typeof c.internal === "object");

  const n = withInternal.length;

  // ---------- Helpers d'agrégation ----------
  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const pct = (count: number) => (n === 0 ? 0 : (count / n) * 100);

  /** Somme des valeurs d'un même dict à travers tous les appels.
   * Ex : sumDicts([{a:1, b:2}, {a:5}]) => {a:6, b:2} */
  const sumDicts = (key: string, sub?: string): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const c of withInternal) {
      const path = sub ? c.internal?.[key]?.[sub] : c.internal?.[key];
      if (!path || typeof path !== "object") continue;
      for (const [k, v] of Object.entries(path)) {
        if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
      }
    }
    return acc;
  };

  const topN = (dict: Record<string, number>, n = 10) =>
    Object.entries(dict)
      .map(([key, count]) => ({ state: key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

  // ---------- Identification ----------
  const finalStatuses: Record<string, number> = {
    success: 0,
    failed_transfer: 0,
    new_patient: 0,
    null_or_other: 0,
  };
  const totalAttempts: number[] = [];
  const errorsByStep: Record<string, number> = {
    birthdate: 0,
    lastname: 0,
    firstname: 0,
    confirm: 0,
  };

  for (const c of withInternal) {
    const ident = c.internal?.identification;
    if (!ident) continue;
    const status = ident.final_status;
    if (status && status in finalStatuses) finalStatuses[status]++;
    else finalStatuses.null_or_other++;

    if (typeof ident.total_attempts === "number") totalAttempts.push(ident.total_attempts);

    const errs = ident.errors_by_step || {};
    for (const k of ["birthdate", "lastname", "firstname", "confirm"]) {
      const v = errs[k];
      if (typeof v === "number") errorsByStep[k] += v;
    }
  }

  // ---------- Steps (qualité par étape) ----------
  const repeatsByState = sumDicts("steps", "repeats_by_state");
  const errorsLogicByState = sumDicts("steps", "errors_logic_by_state");
  const errorsTimeoutByState = sumDicts("steps", "errors_timeout_by_state");

  const bargeIns: number[] = [];
  const durations: number[] = [];
  const statesVisitedLengths: number[] = [];

  for (const c of withInternal) {
    const s = c.internal?.steps;
    if (!s) continue;
    if (typeof s.barge_in_count === "number") bargeIns.push(s.barge_in_count);
    if (typeof s.duration_minutes === "number") durations.push(s.duration_minutes);
    if (Array.isArray(s.states_visited)) statesVisitedLengths.push(s.states_visited.length);
  }

  // Buckets de longueur de parcours
  const lenBuckets = [
    { bucket: "1-5", count: 0 },
    { bucket: "6-10", count: 0 },
    { bucket: "11-20", count: 0 },
    { bucket: "21-30", count: 0 },
    { bucket: "30+", count: 0 },
  ];
  for (const l of statesVisitedLengths) {
    if (l <= 5) lenBuckets[0].count++;
    else if (l <= 10) lenBuckets[1].count++;
    else if (l <= 20) lenBuckets[2].count++;
    else if (l <= 30) lenBuckets[3].count++;
    else lenBuckets[4].count++;
  }

  // ---------- API performance ----------
  const azureAvgs: number[] = [];
  const azureMaxes: number[] = [];
  const azureCalls: number[] = [];
  const ai2risAvgs: number[] = [];
  const ai2risMaxes: number[] = [];
  const ai2risCalls: number[] = [];
  const retries: number[] = [];
  const slowCalls: number[] = [];
  const timeoutsAll: Record<string, number> = {};

  for (const c of withInternal) {
    const api = c.internal?.api_performance;
    if (!api) continue;
    if (typeof api.azure_avg_ms === "number") azureAvgs.push(api.azure_avg_ms);
    if (typeof api.azure_max_ms === "number") azureMaxes.push(api.azure_max_ms);
    if (typeof api.azure_call_count === "number") azureCalls.push(api.azure_call_count);
    if (typeof api.ai2ris_avg_ms === "number") ai2risAvgs.push(api.ai2ris_avg_ms);
    if (typeof api.ai2ris_max_ms === "number") ai2risMaxes.push(api.ai2ris_max_ms);
    if (typeof api.ai2ris_call_count === "number") ai2risCalls.push(api.ai2ris_call_count);
    if (typeof api.retries_total === "number") retries.push(api.retries_total);
    if (typeof api.slow_calls_count === "number") slowCalls.push(api.slow_calls_count);

    const tbe = api.timeouts_by_endpoint || {};
    for (const [endpoint, count] of Object.entries(tbe)) {
      if (typeof count === "number") timeoutsAll[endpoint] = (timeoutsAll[endpoint] ?? 0) + count;
    }
  }

  // ---------- STT ----------
  const sttFallback: number[] = [];
  const sttLanguages: Record<string, number> = {};
  const sttUtterances: number[] = [];

  for (const c of withInternal) {
    const s = c.internal?.stt;
    if (!s) continue;
    if (typeof s.fallback_recognizing_count === "number") sttFallback.push(s.fallback_recognizing_count);
    if (typeof s.total_utterances === "number") sttUtterances.push(s.total_utterances);
    const lang = s.language_detected;
    if (lang && typeof lang === "string") {
      sttLanguages[lang] = (sttLanguages[lang] ?? 0) + 1;
    }
  }

  // ---------- Slot ----------
  const iterationsDist: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  const dispoExprimees: number[] = [];
  let noSlotsTrig = 0;
  let multiAsked = 0;
  let multiAccepted = 0;
  let slotCount = 0; // appels avec un slot internal

  for (const c of withInternal) {
    const s = c.internal?.slot;
    if (!s) continue;
    slotCount++;
    const it = s.iterations_to_accept;
    if (typeof it === "number") {
      if (it === 0) iterationsDist["0"]++;
      else if (it === 1) iterationsDist["1"]++;
      else if (it === 2) iterationsDist["2"]++;
      else iterationsDist["3+"]++;
    }
    if (typeof s.dispo_exprimee_count === "number") dispoExprimees.push(s.dispo_exprimee_count);
    if (s.no_slots_flow_triggered === true) noSlotsTrig++;
    if (s.multisite_question_asked === true) multiAsked++;
    if (s.multisite_accepted === true) multiAccepted++;
  }

  // ---------- Middlewares ----------
  let urgence = 0;
  let human = 0;
  let multiExam = 0;
  let endConv = 0;
  const repeatIntents: number[] = [];
  const repeatSlowerIntents: number[] = [];

  for (const c of withInternal) {
    const m = c.internal?.middlewares;
    if (!m) continue;
    if (m.urgence_triggered === true) urgence++;
    if (m.human_requested === true) human++;
    if (m.multi_exam_detected === true) multiExam++;
    if (m.end_conversation_triggered === true) endConv++;
    if (typeof m.repeat_intent_count === "number") repeatIntents.push(m.repeat_intent_count);
    if (typeof m.repeat_slower_intent_count === "number") repeatSlowerIntents.push(m.repeat_slower_intent_count);
  }

  // ---------- Eager (évaluation EagerEndOfTurn) ----------
  // Lecture : c.internal.eager = { eager_count, turn_resumed_count, _gain_sum_ms,
  // gain_avg_ms, gain_max_ms, by_state: { [step]: { mêmes champs } } }.
  //
  // IMPORTANT : on agrège en repartant des SOMMES (eager_count, _gain_sum_ms)
  // puis on recalcule gain_avg_ms = Σ_gain_sum_ms / Σeager_count.
  // Surtout PAS de moyenne des moyennes — pondération par eager_count obligatoire.
  type EagerAcc = {
    eagerCount: number;
    resumedCount: number;
    gainSumMs: number;
    gainMaxMs: number;
  };
  const eagerGlobalAcc: EagerAcc = {
    eagerCount: 0,
    resumedCount: 0,
    gainSumMs: 0,
    gainMaxMs: 0,
  };
  const eagerByStateAcc = new Map<string, EagerAcc>();

  for (const c of withInternal) {
    const eager = c.internal?.eager;
    if (!eager) continue;
    const ec = typeof eager.eager_count === "number" ? eager.eager_count : 0;
    const rc = typeof eager.turn_resumed_count === "number" ? eager.turn_resumed_count : 0;
    // Skip les appels sans aucun event Eager pour ne pas polluer les moyennes.
    if (ec === 0 && rc === 0) continue;

    eagerGlobalAcc.eagerCount += ec;
    eagerGlobalAcc.resumedCount += rc;
    if (typeof eager._gain_sum_ms === "number") eagerGlobalAcc.gainSumMs += eager._gain_sum_ms;
    if (typeof eager.gain_max_ms === "number") {
      eagerGlobalAcc.gainMaxMs = Math.max(eagerGlobalAcc.gainMaxMs, eager.gain_max_ms);
    }

    const byState = eager.by_state;
    if (byState && typeof byState === "object") {
      for (const [step, raw] of Object.entries(byState)) {
        if (!raw || typeof raw !== "object") continue;
        const m = raw as any;
        if (!eagerByStateAcc.has(step)) {
          eagerByStateAcc.set(step, {
            eagerCount: 0,
            resumedCount: 0,
            gainSumMs: 0,
            gainMaxMs: 0,
          });
        }
        const acc = eagerByStateAcc.get(step)!;
        if (typeof m.eager_count === "number") acc.eagerCount += m.eager_count;
        if (typeof m.turn_resumed_count === "number") acc.resumedCount += m.turn_resumed_count;
        if (typeof m._gain_sum_ms === "number") acc.gainSumMs += m._gain_sum_ms;
        if (typeof m.gain_max_ms === "number") {
          acc.gainMaxMs = Math.max(acc.gainMaxMs, m.gain_max_ms);
        }
      }
    }
  }

  /** Dérive les métriques utiles + une reco ON/OFF basée sur seuils. */
  function deriveEager(acc: EagerAcc) {
    const volume = acc.eagerCount + acc.resumedCount;
    const fausseFinRate = volume > 0 ? acc.resumedCount / volume : 0;
    const gainAvgMs = acc.eagerCount > 0 ? acc.gainSumMs / acc.eagerCount : 0;
    const gainExpectedMs = gainAvgMs * (1 - fausseFinRate);
    const gainTotalMs = acc.gainSumMs; // = eagerCount × gainAvgMs

    // Seuils proposés : volume suffisant ≥ 100, gain pertinent > 250ms,
    // taux de fausses fins acceptable < 15%. Les "watch" sont entre les deux.
    let recommendation: "activate" | "watch" | "skip" | "insufficient";
    if (volume < 100) {
      recommendation = "insufficient";
    } else if (fausseFinRate < 0.15 && gainAvgMs > 250) {
      recommendation = "activate";
    } else if (fausseFinRate > 0.25 || gainAvgMs < 150) {
      recommendation = "skip";
    } else {
      recommendation = "watch";
    }

    return {
      volume,
      eagerCount: acc.eagerCount,
      resumedCount: acc.resumedCount,
      // Pourcentages renvoyés × 100 avec 2 décimales pour pré-calcul côté UI.
      fausseFinRatePct: Math.round(fausseFinRate * 10000) / 100,
      gainAvgMs: Math.round(gainAvgMs),
      gainMaxMs: Math.round(acc.gainMaxMs),
      gainTotalMs: Math.round(gainTotalMs),
      gainExpectedMs: Math.round(gainExpectedMs),
      recommendation,
    };
  }

  const eagerGlobal = deriveEager(eagerGlobalAcc);
  const eagerByState = Array.from(eagerByStateAcc.entries())
    .map(([state, acc]) => ({ state, ...deriveEager(acc) }))
    .sort((a, b) => b.gainTotalMs - a.gainTotalMs);

  // ---------- Timeseries (évolution temporelle par jour) ----------
  // On bucket les indicateurs clés par jour ISO (YYYY-MM-DD) pour exposer une
  // courbe temporelle. On génère un point par jour de la fenêtre, même quand
  // 0 appel — la courbe reste continue.
  type DayBucket = {
    calls: number;
    identSuccess: number;
    durations: number[];
    azureAvgs: number[];
    ai2risAvgs: number[];
  };
  const byDay = new Map<string, DayBucket>();
  // Clé jour en local time (et NON UTC) — sinon un appel passé à 23h heure
  // locale (= 22h UTC en CEST) serait bucketé sur la veille et l'agrégat
  // afficherait des jours vides alors qu'il y a des appels.
  const dayKey = (d: Date | string) => {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  for (const c of withInternal) {
    const k = dayKey(c.createdAt);
    if (!byDay.has(k)) {
      byDay.set(k, { calls: 0, identSuccess: 0, durations: [], azureAvgs: [], ai2risAvgs: [] });
    }
    const slot = byDay.get(k)!;
    slot.calls++;
    if (c.internal?.identification?.final_status === "success") slot.identSuccess++;
    const dur = c.internal?.steps?.duration_minutes;
    if (typeof dur === "number") slot.durations.push(dur);
    const azure = c.internal?.api_performance?.azure_avg_ms;
    if (typeof azure === "number") slot.azureAvgs.push(azure);
    const ai2ris = c.internal?.api_performance?.ai2ris_avg_ms;
    if (typeof ai2ris === "number") slot.ai2risAvgs.push(ai2ris);
  }

  const timeseries: Array<{
    date: string;
    dayLabel: string;
    calls: number;
    identSuccessPct: number;
    avgDuration: number;
    azureAvgMs: number;
    ai2risAvgMs: number;
  }> = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    const k = dayKey(cursor);
    const d = byDay.get(k);
    const callsCount = d?.calls ?? 0;
    timeseries.push({
      date: k,
      dayLabel: cursor.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      calls: callsCount,
      identSuccessPct:
        callsCount > 0 && d ? Math.round((d.identSuccess / callsCount) * 100 * 10) / 10 : 0,
      avgDuration: d?.durations.length ? Math.round(avg(d.durations) * 100) / 100 : 0,
      azureAvgMs: d?.azureAvgs.length ? Math.round(avg(d.azureAvgs)) : 0,
      ai2risAvgMs: d?.ai2risAvgs.length ? Math.round(avg(d.ai2risAvgs)) : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // ---------- Réponse ----------
  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    totalCalls: calls.length,
    callsWithInternal: n,
    timeseries,
    eager: {
      global: eagerGlobal,
      byState: eagerByState,
    },

    identification: {
      finalStatusDistribution: finalStatuses,
      errorsByStep,
      avgTotalAttempts: Math.round(avg(totalAttempts) * 100) / 100,
    },

    steps: {
      topRepeats: topN(repeatsByState),
      topErrorsLogic: topN(errorsLogicByState),
      topErrorsTimeout: topN(errorsTimeoutByState),
      avgBargeIn: Math.round(avg(bargeIns) * 100) / 100,
      avgDurationMinutes: Math.round(avg(durations) * 100) / 100,
      statesVisitedLengthDistribution: lenBuckets,
    },

    apiPerformance: {
      azureAvgMs: Math.round(avg(azureAvgs)),
      azureMaxMs: Math.max(0, ...azureMaxes),
      azureTotalCalls: sum(azureCalls),
      ai2risAvgMs: Math.round(avg(ai2risAvgs)),
      ai2risMaxMs: Math.max(0, ...ai2risMaxes),
      ai2risTotalCalls: sum(ai2risCalls),
      avgRetries: Math.round(avg(retries) * 100) / 100,
      avgSlowCalls: Math.round(avg(slowCalls) * 100) / 100,
      timeoutsByEndpoint: topN(timeoutsAll),
    },

    stt: {
      avgFallbackRecognizing: Math.round(avg(sttFallback) * 100) / 100,
      avgTotalUtterances: Math.round(avg(sttUtterances) * 100) / 100,
      languageDistribution: Object.entries(sttLanguages)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count),
    },

    slot: {
      iterationsDistribution: Object.entries(iterationsDist).map(([iterations, count]) => ({
        iterations,
        count,
      })),
      avgDispoExprimee: Math.round(avg(dispoExprimees) * 100) / 100,
      pctNoSlotsFlowTriggered: Math.round(pct(noSlotsTrig) * 100) / 100,
      pctMultisiteQuestionAsked: Math.round(pct(multiAsked) * 100) / 100,
      pctMultisiteAccepted: Math.round(pct(multiAccepted) * 100) / 100,
    },

    middlewares: {
      pctUrgence: Math.round(pct(urgence) * 100) / 100,
      pctHuman: Math.round(pct(human) * 100) / 100,
      pctMultiExam: Math.round(pct(multiExam) * 100) / 100,
      pctEndConversation: Math.round(pct(endConv) * 100) / 100,
      avgRepeatIntent: Math.round(avg(repeatIntents) * 100) / 100,
      avgRepeatSlowerIntent: Math.round(avg(repeatSlowerIntents) * 100) / 100,
    },
  });
}

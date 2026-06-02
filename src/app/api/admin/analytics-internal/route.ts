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

  // ---------- Monitoring de features candidates (registre unifié) ----------
  // 3 features partagent le même modèle : VOLUME (opportunités), BÉNÉFICE (ms
  // gagnables), COÛT/RISQUE (gaspillage), VENTILATION PAR ÉTAPE, parfois
  // DISTRIBUTION.
  //   - eager              (speculative EagerEndOfTurn)
  //   - tts_streaming      (streaming ElevenLabs)
  //   - buffered_utterance (barge-in bridé pendant audios non-interruptibles)
  //
  // RÈGLE D'OR (§5 du brief) : on agrège en repartant des SOMMES — _*_sum_ms et
  // *_count — puis on recalcule les moyennes (Σsum / Σcount). JAMAIS de moyenne
  // des moyennes par appel : on pondère par le volume.

  /**
   * Bénéfice = ce que la feature rapporte.
   *  - "ms"    : un temps gagnable (gain/wait/overshoot moyen). Cas standard.
   *  - "count" : un nb d'events récupérables (ex. mw_late_detection : détections perdues).
   * Coût = ce que la feature coûte. Trois modes :
   *  - "count" : nb d'events gaspillés (fausses fins, cache hits, jetées).
   *  - "ms"    : un coût en temps (overshoot à ajouter au cutoff sur TOUS les tours).
   *  - null    : non mesuré côté donnée (qualitatif / UX).
   */
  type BenefitKind = "ms" | "count";
  type CostKind = "count" | "ms" | null;

  type FeatureConfig = {
    /** Clé d'accès dans `c.internal`. */
    rootKey: string;
    benefitKind: BenefitKind;
    costKind: CostKind;
    /** Champ donnant le nb d'events "confirmés" (sert au pondérage des moyennes). */
    confirmedField: string;

    // --- BÉNÉFICE en ms ---
    /** Somme interne (préfixe "_") des bénéfices. Requis si benefitKind === "ms". */
    benefitSumField?: string;
    /** Max observé. Requis si benefitKind === "ms". */
    benefitMaxField?: string;

    // --- COÛT en count ---
    /** Champ comptant les events gaspillés. Requis si costKind === "count". */
    costCountField?: string;

    // --- COÛT en ms ---
    /** Somme interne du coût en ms. Requis si costKind === "ms". */
    costSumField?: string;
    /** Max coût ms. Requis si costKind === "ms". */
    costMaxField?: string;
    /** Compteur pour pondérer la moyenne du coût ms (souvent identique à confirmedField). */
    costAvgWeightField?: string;

    /** Si true : volume = confirmed + costCount ; sinon volume = confirmed. */
    volumeIncludesCost: boolean;
    /** Champ contenant l'objet de ventilation (by_state ou by_detector). */
    byStateField: string;
    /** Champ optionnel de distribution (array de buckets). */
    distributionField: string | null;
    /** Champs additionnels (somme + count) pour moyennes pondérées (KPI extras). */
    extras?: { outKey: string; sumField: string; countField: string }[];
    /** Seuils pour la reco. Tous optionnels — sélectionnés selon le kind dans deriveFromAcc. */
    thresholds: {
      minVolume: number;
      // Pour costKind === "count"
      goodCostRatio?: number;
      badCostRatio?: number;
      // Pour costKind === "ms"
      goodCostMs?: number;
      badCostMs?: number;
      // Pour benefitKind === "ms"
      goodBenefitMs?: number;
      badBenefitMs?: number;
      // Pour benefitKind === "count"
      goodBenefitCount?: number;
      badBenefitCount?: number;
    };
  };

  const FEATURE_CONFIGS: Record<string, FeatureConfig> = {
    eager: {
      rootKey: "eager",
      benefitKind: "ms",
      costKind: "count",
      confirmedField: "eager_count",
      costCountField: "turn_resumed_count",
      benefitSumField: "_gain_sum_ms",
      benefitMaxField: "gain_max_ms",
      volumeIncludesCost: true,
      byStateField: "by_state",
      distributionField: null,
      thresholds: { minVolume: 100, goodCostRatio: 0.15, badCostRatio: 0.25, goodBenefitMs: 250, badBenefitMs: 150 },
    },
    tts_streaming: {
      rootKey: "tts_streaming",
      benefitKind: "ms",
      costKind: "count",
      // Le bénéfice n'existe QUE sur les miss (cache hit = pas d'appel ElevenLabs).
      confirmedField: "miss_count",
      costCountField: "cache_hit_count",
      benefitSumField: "_gain_sum_ms",
      benefitMaxField: "gain_max_ms",
      volumeIncludesCost: true,
      byStateField: "by_state",
      distributionField: "gain_distribution",
      extras: [
        { outKey: "firstChunkAvgMs", sumField: "_first_chunk_sum_ms", countField: "miss_count" },
        { outKey: "streamTotalAvgMs", sumField: "_stream_total_sum_ms", countField: "miss_count" },
        // char_avg s'applique aux segments générés (miss).
        { outKey: "charAvg", sumField: "_char_sum", countField: "miss_count" },
      ],
      thresholds: { minVolume: 100, goodCostRatio: 0.85, badCostRatio: 0.95, goodBenefitMs: 200, badBenefitMs: 100 },
    },
    buffered_utterance: {
      rootKey: "buffered_utterance",
      benefitKind: "ms",
      costKind: "count",
      // count = utterances bufferisées consommées (toutes "confirmées" rapportent du gain).
      confirmedField: "count",
      costCountField: "discarded_count",
      benefitSumField: "_wait_sum_ms",
      benefitMaxField: "wait_max_ms",
      // discarded_count ⊆ count (sous-ensemble jeté) : volume = count, pas count+discarded.
      volumeIncludesCost: false,
      byStateField: "by_state",
      distributionField: "wait_distribution",
      thresholds: { minVolume: 100, goodCostRatio: 0.20, badCostRatio: 0.40, goodBenefitMs: 200, badBenefitMs: 80 },
    },
    mw_late_detection: {
      rootKey: "mw_late_detection",
      // Bénéfice = nb de détections perdues récupérables (un COMPTE).
      benefitKind: "count",
      // Coût = de combien remonter le cutoff (latence ajoutée à TOUS les tours).
      costKind: "ms",
      // count = détections perdues (= confirmedCount = benefitCount).
      confirmedField: "count",
      costSumField: "_overshoot_sum_ms",
      costMaxField: "overshoot_max_ms",
      costAvgWeightField: "count",
      volumeIncludesCost: false,
      // ⚠️ ventilation par DÉTECTEUR (detectUrgence, detectMulti…), pas par état métier.
      byStateField: "by_detector",
      distributionField: "overshoot_distribution",
      thresholds: {
        minVolume: 30,
        // Bcp de détections + overshoot faible = activer
        goodBenefitCount: 10,
        badBenefitCount: 3,
        goodCostMs: 300,
        badCostMs: 800,
      },
    },
    wait_sound_overshoot: {
      rootKey: "wait_sound_overshoot",
      benefitKind: "ms",
      // Coût non mesuré (qualitatif : naturel dégradé si wait sound coupé).
      costKind: null,
      confirmedField: "count",
      benefitSumField: "_overshoot_sum_ms",
      benefitMaxField: "overshoot_max_ms",
      volumeIncludesCost: false,
      byStateField: "by_state",
      distributionField: "overshoot_distribution",
      thresholds: { minVolume: 100, goodBenefitMs: 300, badBenefitMs: 100 },
    },
  };

  type FeatureAcc = {
    confirmedCount: number;
    /** Coût en count (cache hits, fausses fins, jetées…). */
    costCount: number;
    /** Bénéfice en ms : somme pondérée par confirmedField. */
    benefitSumMs: number;
    benefitMaxMs: number;
    /** Coût en ms : somme pondérée par costAvgWeightField. */
    costSumMs: number;
    costMaxMs: number;
    costAvgWeight: number;
    extrasSum: Record<string, number>;
    extrasCount: Record<string, number>;
    /** Distribution agrégée bucket-à-bucket (clé = range string). */
    distribution: Map<string, { range: string; min: number; max: number; count: number }> | null;
  };

  function newAcc(cfg: FeatureConfig): FeatureAcc {
    return {
      confirmedCount: 0,
      costCount: 0,
      benefitSumMs: 0,
      benefitMaxMs: 0,
      costSumMs: 0,
      costMaxMs: 0,
      costAvgWeight: 0,
      extrasSum: {},
      extrasCount: {},
      distribution: cfg.distributionField ? new Map() : null,
    };
  }

  /** Accumule une "instance" (un appel pour le global, ou un by_state[step]). */
  function addToAcc(acc: FeatureAcc, cfg: FeatureConfig, payload: any) {
    if (!payload || typeof payload !== "object") return;
    const ce = payload[cfg.confirmedField];
    if (typeof ce === "number") acc.confirmedCount += ce;

    // Bénéfice en ms (sinon le bénéfice IS confirmedCount, déjà compté).
    if (cfg.benefitKind === "ms") {
      if (cfg.benefitSumField) {
        const bs = payload[cfg.benefitSumField];
        if (typeof bs === "number") acc.benefitSumMs += bs;
      }
      if (cfg.benefitMaxField) {
        const bm = payload[cfg.benefitMaxField];
        if (typeof bm === "number") acc.benefitMaxMs = Math.max(acc.benefitMaxMs, bm);
      }
    }

    // Coût selon kind.
    if (cfg.costKind === "count" && cfg.costCountField) {
      const co = payload[cfg.costCountField];
      if (typeof co === "number") acc.costCount += co;
    } else if (cfg.costKind === "ms") {
      if (cfg.costSumField) {
        const cs = payload[cfg.costSumField];
        if (typeof cs === "number") acc.costSumMs += cs;
      }
      if (cfg.costMaxField) {
        const cm = payload[cfg.costMaxField];
        if (typeof cm === "number") acc.costMaxMs = Math.max(acc.costMaxMs, cm);
      }
      if (cfg.costAvgWeightField) {
        const cw = payload[cfg.costAvgWeightField];
        if (typeof cw === "number") acc.costAvgWeight += cw;
      }
    }

    if (cfg.extras) {
      for (const ex of cfg.extras) {
        const s = payload[ex.sumField];
        const c = payload[ex.countField];
        if (typeof s === "number") acc.extrasSum[ex.outKey] = (acc.extrasSum[ex.outKey] ?? 0) + s;
        if (typeof c === "number") acc.extrasCount[ex.outKey] = (acc.extrasCount[ex.outKey] ?? 0) + c;
      }
    }
  }

  /** Agrège la distribution bucket-à-bucket (somme des count). */
  function addDistribution(
    acc: FeatureAcc,
    distField: string | null,
    payload: any
  ) {
    if (!distField || !acc.distribution) return;
    const dist = payload?.[distField];
    if (!Array.isArray(dist)) return;
    for (const b of dist) {
      if (!b || typeof b !== "object") continue;
      const range = String(b.range ?? `${b.min}-${b.max}`);
      const existing = acc.distribution.get(range);
      if (existing) {
        existing.count += typeof b.count === "number" ? b.count : 0;
      } else {
        acc.distribution.set(range, {
          range,
          min: typeof b.min === "number" ? b.min : 0,
          max: typeof b.max === "number" ? b.max : 0,
          count: typeof b.count === "number" ? b.count : 0,
        });
      }
    }
  }

  /** Dérive les métriques finales depuis un accumulateur. */
  function deriveFromAcc(acc: FeatureAcc, cfg: FeatureConfig) {
    const volume =
      cfg.volumeIncludesCost && cfg.costKind === "count"
        ? acc.confirmedCount + acc.costCount
        : acc.confirmedCount;

    // --- Bénéfice ---
    const benefitAvgMs =
      cfg.benefitKind === "ms" && acc.confirmedCount > 0
        ? acc.benefitSumMs / acc.confirmedCount
        : 0;
    const benefitMaxMs = cfg.benefitKind === "ms" ? acc.benefitMaxMs : 0;
    // Pour benefitKind="ms" : total = Σ_sum_ms (cohérent avec confirmedCount × avg)
    // Pour benefitKind="count" : "total" = confirmedCount (= nb d'events récupérables)
    const benefitTotalMs = cfg.benefitKind === "ms" ? acc.benefitSumMs : 0;
    const benefitCount = cfg.benefitKind === "count" ? acc.confirmedCount : 0;

    // --- Coût ---
    let costRatio = 0;
    let costAvgMs = 0;
    let costMaxMs = 0;
    if (cfg.costKind === "count") {
      costRatio = volume > 0 ? acc.costCount / volume : 0;
    } else if (cfg.costKind === "ms") {
      costAvgMs = acc.costAvgWeight > 0 ? acc.costSumMs / acc.costAvgWeight : 0;
      costMaxMs = acc.costMaxMs;
    }

    // --- Expected per event (= bénéfice ajusté par le risque). N'a de sens que
    // pour benefitKind="ms" + costKind="count" (pondération par le ratio). ---
    const expectedPerEventMs =
      cfg.benefitKind === "ms" && cfg.costKind === "count"
        ? benefitAvgMs * (1 - costRatio)
        : 0;

    // --- Recommandation ---
    const th = cfg.thresholds;
    let recommendation: "activate" | "watch" | "skip" | "insufficient";
    if (volume < th.minVolume) {
      recommendation = "insufficient";
    } else if (cfg.benefitKind === "count" && cfg.costKind === "ms") {
      // mw_late_detection : bcp de détections + faible overshoot = activer.
      if (
        benefitCount >= (th.goodBenefitCount ?? Infinity) &&
        costAvgMs <= (th.goodCostMs ?? -Infinity)
      ) {
        recommendation = "activate";
      } else if (
        benefitCount <= (th.badBenefitCount ?? -Infinity) ||
        costAvgMs >= (th.badCostMs ?? Infinity)
      ) {
        recommendation = "skip";
      } else {
        recommendation = "watch";
      }
    } else if (cfg.costKind === null) {
      // wait_sound_overshoot : pas de coût → reco basée seulement sur le bénéfice.
      if (benefitAvgMs > (th.goodBenefitMs ?? Infinity)) recommendation = "activate";
      else if (benefitAvgMs < (th.badBenefitMs ?? -Infinity)) recommendation = "skip";
      else recommendation = "watch";
    } else {
      // Default : benefitKind="ms" + costKind="count" (eager / tts / buffered).
      if (
        costRatio < (th.goodCostRatio ?? Infinity) &&
        benefitAvgMs > (th.goodBenefitMs ?? -Infinity)
      ) {
        recommendation = "activate";
      } else if (
        costRatio > (th.badCostRatio ?? -Infinity) ||
        benefitAvgMs < (th.badBenefitMs ?? Infinity)
      ) {
        recommendation = "skip";
      } else {
        recommendation = "watch";
      }
    }

    // Extras (moyennes pondérées via Σ / Σcount).
    const extras: Record<string, number> = {};
    if (cfg.extras) {
      for (const ex of cfg.extras) {
        const s = acc.extrasSum[ex.outKey] ?? 0;
        const c = acc.extrasCount[ex.outKey] ?? 0;
        extras[ex.outKey] = c > 0 ? Math.round((s / c) * 100) / 100 : 0;
      }
    }

    return {
      volume,
      confirmedCount: acc.confirmedCount,
      // Bénéfice (selon kind)
      benefitAvgMs: Math.round(benefitAvgMs),
      benefitMaxMs: Math.round(benefitMaxMs),
      benefitTotalMs: Math.round(benefitTotalMs),
      benefitCount,
      // Coût (selon kind)
      costCount: acc.costCount,
      costRatioPct: Math.round(costRatio * 10000) / 100,
      costAvgMs: Math.round(costAvgMs),
      costMaxMs: Math.round(costMaxMs),
      // Helpers
      expectedPerEventMs: Math.round(expectedPerEventMs),
      recommendation,
      extras,
    };
  }

  /** Agrège une feature complète sur tous les appels withInternal. */
  function aggregateFeature(cfg: FeatureConfig) {
    const globalAcc = newAcc(cfg);
    const byStateAccs = new Map<string, FeatureAcc>();

    for (const c of withInternal) {
      const payload = c.internal?.[cfg.rootKey];
      if (!payload) continue;
      const confirmed =
        typeof payload[cfg.confirmedField] === "number" ? payload[cfg.confirmedField] : 0;
      const cost =
        cfg.costKind === "count" && cfg.costCountField && typeof payload[cfg.costCountField] === "number"
          ? payload[cfg.costCountField]
          : 0;
      // Skip les appels sans aucun event pour ne pas polluer (cf. §7 du brief).
      if (confirmed === 0 && cost === 0) continue;

      addToAcc(globalAcc, cfg, payload);
      addDistribution(globalAcc, cfg.distributionField, payload);

      const byState = payload[cfg.byStateField];
      if (byState && typeof byState === "object") {
        for (const [step, raw] of Object.entries(byState)) {
          if (!raw || typeof raw !== "object") continue;
          if (!byStateAccs.has(step)) byStateAccs.set(step, newAcc(cfg));
          addToAcc(byStateAccs.get(step)!, cfg, raw);
        }
      }
    }

    const global = deriveFromAcc(globalAcc, cfg);
    const byState = Array.from(byStateAccs.entries())
      .map(([state, acc]) => ({ state, ...deriveFromAcc(acc, cfg) }))
      // Tri par bénéfice total selon le kind : ms → benefitTotalMs ; count → benefitCount.
      .sort((a, b) => {
        const va = cfg.benefitKind === "ms" ? a.benefitTotalMs : a.benefitCount;
        const vb = cfg.benefitKind === "ms" ? b.benefitTotalMs : b.benefitCount;
        return vb - va;
      });

    const distribution = globalAcc.distribution
      ? Array.from(globalAcc.distribution.values()).sort((a, b) => a.min - b.min)
      : null;

    return { global, byState, distribution };
  }

  const features = {
    eager: aggregateFeature(FEATURE_CONFIGS.eager),
    tts_streaming: aggregateFeature(FEATURE_CONFIGS.tts_streaming),
    buffered_utterance: aggregateFeature(FEATURE_CONFIGS.buffered_utterance),
    mw_late_detection: aggregateFeature(FEATURE_CONFIGS.mw_late_detection),
    wait_sound_overshoot: aggregateFeature(FEATURE_CONFIGS.wait_sound_overshoot),
  };

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
    features,

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

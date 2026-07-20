/**
 * Agrégation du funnel hiérarchique de conversion par centre.
 *
 * Modèle (2026-07-20) :
 *
 *   Accueil (tous les appels)
 *     └─ Intention (intent capturé, tous types)
 *          ├─ Sous-funnel prise_rdv       → goal = booked
 *          ├─ Sous-funnel modification_rdv → goal = modified
 *          ├─ Sous-funnel annulation_rdv   → goal = cancelled
 *          ├─ Sous-funnel confirmation_rdv → goal = confirmed
 *          ├─ Sous-funnel consultation_rdv → goal = rdv_info_provided
 *          └─ Sous-funnel renseignement    → goal = answer_provided
 *
 *   Conversion globale = somme(goals aboutis tous intents) / total appels
 *
 * Contrat bot attendu (nouveau) :
 *   funnel: {
 *     intents:      string[]       // liste ordonnée d'intents captés
 *     intent:       string         // legacy = dernier intent (rétrocompat)
 *     common_stages: { answered, intent_captured }
 *     intent_stages: {
 *       prise_rdv: { exam_identified, slot_proposed, ..., booked, goal_achieved }
 *       modification_rdv: { patient_identified, rdv_found, ..., modified, goal_achieved }
 *       ...
 *     }
 *     completed, outcome, furthest_stage, drop_stage    // meta
 *   }
 *
 * Rétrocompat lecture (vieux payload) :
 *   - `stages: { answered, intent_captured, exam_identified, ..., booked }`
 *     est lu comme common_stages (answered + intent_captured) plus
 *     intent_stages.prise_rdv (les 5 étapes suivantes + goal_achieved =
 *     stages.booked). Les vieux appels d'un intent non-prise se voient
 *     attribuer `goal_achieved = funnel.completed === true` faute d'étapes
 *     détaillées disponibles.
 */

// ============================================================================
// Constantes & Types
// ============================================================================

/** Les 6 intents "métier" que le bot peut détecter, plus "unknown" (fallback). */
export const INTENT_KEYS = [
  "prise_rdv",
  "modification_rdv",
  "annulation_rdv",
  "confirmation_rdv",
  "consultation_rdv",
  "renseignement",
  "unknown",
] as const;

export type IntentKey = (typeof INTENT_KEYS)[number];

/** Intents qu'on modélise avec un sous-funnel (unknown est exclu). */
export const TRACKED_INTENTS: readonly IntentKey[] = INTENT_KEYS.filter(
  (k) => k !== "unknown"
) as readonly IntentKey[];

/** Libellés FR des intents. */
export const INTENT_LABELS: Record<IntentKey, string> = {
  prise_rdv: "Prise de RDV",
  modification_rdv: "Modification",
  annulation_rdv: "Annulation",
  confirmation_rdv: "Confirmation",
  consultation_rdv: "Consultation",
  renseignement: "Renseignement",
  unknown: "Inconnu",
};

/** Étapes communes en haut de tous les funnels (peu importe l'intent). */
export const COMMON_STAGES = ["answered", "intent_captured"] as const;
export type CommonStage = (typeof COMMON_STAGES)[number];

/**
 * Étapes propres à chaque sous-funnel, dans l'ordre chronologique du parcours.
 * L'étape terminale (la dernière de la liste) marque l'objectif atteint,
 * et est doublée par le flag `goal_achieved` que le bot pousse (redondance
 * voulue : `goal_achieved` fait autorité, la liste sert au rendu visuel).
 */
export const INTENT_STAGES: Record<IntentKey, readonly string[]> = {
  prise_rdv: [
    "exam_identified",
    "slot_proposed",
    "slot_accepted",
    "identified",
    "booked",
  ],
  modification_rdv: [
    "patient_identified",
    "rdv_found",
    "new_slot_proposed",
    "new_slot_accepted",
    "modified",
  ],
  annulation_rdv: [
    "patient_identified",
    "rdv_found",
    "cancellation_confirmed",
    "cancelled",
  ],
  confirmation_rdv: ["patient_identified", "rdv_found", "confirmed"],
  consultation_rdv: ["patient_identified", "rdv_found", "rdv_info_provided"],
  renseignement: ["question_understood", "answer_provided"],
  unknown: [],
};

/** Nom de l'étape terminale qui valide "goal_achieved" pour chaque intent. */
export const GOAL_STAGE: Record<IntentKey, string | null> = {
  prise_rdv: "booked",
  modification_rdv: "modified",
  annulation_rdv: "cancelled",
  confirmation_rdv: "confirmed",
  consultation_rdv: "rdv_info_provided",
  renseignement: "answer_provided",
  unknown: null,
};

/**
 * Libellés FR courts de chaque étape, pour le rendu barre + tooltip.
 * Regroupés dans un seul map (les mêmes noms de stages peuvent apparaître
 * dans plusieurs intents — ex. `patient_identified` — on garde le libellé
 * cohérent).
 */
export const STAGE_LABELS: Record<string, string> = {
  // Communes
  answered: "Accueil",
  intent_captured: "Intention",
  // Prise de RDV
  exam_identified: "Examen identifié",
  slot_proposed: "Créneau proposé",
  slot_accepted: "Créneau accepté",
  identified: "Patient identifié",
  booked: "RDV pris",
  // Modification
  patient_identified: "Patient identifié",
  rdv_found: "RDV trouvé",
  new_slot_proposed: "Nouveau créneau proposé",
  new_slot_accepted: "Nouveau créneau accepté",
  modified: "RDV modifié",
  // Annulation
  cancellation_confirmed: "Annulation confirmée",
  cancelled: "RDV annulé",
  // Confirmation
  confirmed: "RDV confirmé",
  // Consultation
  rdv_info_provided: "Infos RDV données",
  // Renseignement
  question_understood: "Question comprise",
  answer_provided: "Réponse donnée",
};

export type FunnelOutcome = "completed" | "transfer" | "hangup" | "abandoned";

/**
 * Payload brut envoyé par le bot dans `stats.funnel`.
 * Deux formats acceptés : le nouveau (intent_stages) et le legacy (stages plat).
 */
export type RawFunnel = {
  /** Nouveau : liste d'intents dans l'ordre chronologique. */
  intents?: Array<IntentKey | string>;
  /** Legacy : dernier intent (rétrocompat). */
  intent?: IntentKey | string;

  /** Nouveau : les 2 étapes communes (Accueil, Intention). */
  common_stages?: Partial<Record<CommonStage, boolean>>;
  /** Nouveau : étapes détaillées par intent + goal_achieved. */
  intent_stages?: Partial<Record<IntentKey, Record<string, boolean>>>;

  /** Legacy : tout à plat (7 étapes de prise_rdv). Toujours lu en fallback. */
  stages?: Partial<Record<string, boolean>>;

  completed?: boolean;
  outcome?: FunnelOutcome | string;
  furthest_stage?: string | null;
  drop_stage?: string | null;
};

/** Sous-funnel agrégé pour un intent donné. */
export type SubFunnelData = {
  intent: IntentKey;
  label: string;
  /** Nb d'appels ayant cet intent dans leurs `intents[]`. */
  totalCalls: number;
  /** Nb d'appels ayant validé `goal_achieved` pour cet intent. */
  goalAchievedCount: number;
  /** % de goalAchieved sur totalCalls (0..100). */
  goalAchievedPct: number;
  /** Compteur par étape (nb d'appels ayant atteint chaque étape). */
  stageCounts: Record<string, number>;
  /** % par étape, base = totalCalls du sous-funnel (0..100). */
  stagePercents: Record<string, number>;
  /** Étape qui a chuté le plus fort (ou null si aucune fuite significative). */
  biggestDrop: {
    stage: string;
    prevStage: string;
    dropPct: number;
    dropCount: number;
  } | null;
};

/** Agrégat complet du funnel pour une période / un centre. */
export type AggregatedFunnel = {
  /** Total d'appels sur la période (avec funnel défini). */
  totalCalls: number;
  /** Nb d'appels avec `common_stages.answered = true`. */
  answeredCount: number;
  /** Nb d'appels avec `common_stages.intent_captured = true`. */
  intentCapturedCount: number;
  answeredPct: number;
  intentCapturedPct: number;

  /** Sous-funnel par intent — null si 0 appel de cet intent sur la période. */
  subFunnels: Partial<Record<IntentKey, SubFunnelData>>;

  /** Somme des goals aboutis tous intents confondus. */
  totalGoalsAchieved: number;
  /** Conversion globale = totalGoalsAchieved / totalCalls * 100. */
  globalConversionPct: number;
};

export const FUNNEL_LOW_SAMPLE_THRESHOLD = 5;

// ============================================================================
// Helpers d'extraction
// ============================================================================

function extractFunnel(stats: unknown): RawFunnel | null {
  if (!stats || typeof stats !== "object") return null;
  const f = (stats as Record<string, unknown>).funnel;
  if (!f || typeof f !== "object") return null;
  return f as RawFunnel;
}

/** Liste d'intents typés (intents[] > intent legacy > []). */
function extractIntents(f: RawFunnel): IntentKey[] {
  const raw = Array.isArray(f.intents)
    ? f.intents
    : typeof f.intent === "string"
    ? [f.intent]
    : [];
  return raw.filter((s): s is IntentKey =>
    (INTENT_KEYS as readonly string[]).includes(s as string)
  );
}

/** Étapes communes (nouveau format prioritaire, sinon rétrocompat `stages`). */
function extractCommonStages(f: RawFunnel): Record<CommonStage, boolean> {
  const src = f.common_stages ?? f.stages ?? {};
  return {
    answered: src.answered === true,
    intent_captured: src.intent_captured === true,
  };
}

/**
 * Étapes détaillées d'un intent donné. Nouveau format : lit
 * `f.intent_stages[intent]`. Legacy : pour prise_rdv, remonte les 5 étapes
 * depuis le `f.stages` plat + `goal_achieved = stages.booked`. Pour les
 * autres intents en legacy, on n'a pas les étapes → objet vide, mais
 * goal_achieved dérivé de `f.completed`.
 */
function extractIntentStages(
  f: RawFunnel,
  intent: IntentKey
): Record<string, boolean> {
  // 1) Nouveau format : accès direct
  const fromNew = f.intent_stages?.[intent];
  if (fromNew && typeof fromNew === "object") {
    const out: Record<string, boolean> = {};
    for (const stage of INTENT_STAGES[intent]) {
      out[stage] = fromNew[stage] === true;
    }
    // goal_achieved : depuis payload, ou dérivé de l'étape terminale
    const goalStage = GOAL_STAGE[intent];
    const goalFromPayload = fromNew["goal_achieved"];
    if (typeof goalFromPayload === "boolean") {
      out["goal_achieved"] = goalFromPayload;
    } else if (goalStage) {
      out["goal_achieved"] = out[goalStage] === true;
    } else {
      out["goal_achieved"] = false;
    }
    return out;
  }

  // 2) Legacy : pour prise_rdv uniquement, on peut mapper `stages` plat
  if (intent === "prise_rdv" && f.stages) {
    const s = f.stages;
    const out: Record<string, boolean> = {};
    for (const stage of INTENT_STAGES.prise_rdv) {
      out[stage] = s[stage] === true;
    }
    out["goal_achieved"] = s.booked === true;
    return out;
  }

  // 3) Legacy autres intents : pas d'étapes, mais `completed` sert de goal
  const out: Record<string, boolean> = {};
  for (const stage of INTENT_STAGES[intent]) out[stage] = false;
  out["goal_achieved"] = f.completed === true;
  return out;
}

// ============================================================================
// Agrégation principale
// ============================================================================

export function computeFunnel(calls: unknown[]): AggregatedFunnel | null {
  let totalCalls = 0;
  let answeredCount = 0;
  let intentCapturedCount = 0;

  // Prépare un accumulateur par intent tracké.
  type Acc = {
    totalCalls: number;
    goalAchievedCount: number;
    stageCounts: Record<string, number>;
  };
  const accs: Partial<Record<IntentKey, Acc>> = {};
  for (const intent of TRACKED_INTENTS) {
    accs[intent] = {
      totalCalls: 0,
      goalAchievedCount: 0,
      stageCounts: Object.fromEntries(
        INTENT_STAGES[intent].map((s) => [s, 0])
      ),
    };
  }

  for (const c of calls) {
    const f = extractFunnel((c as any)?.stats);
    if (!f) continue;
    totalCalls++;

    const common = extractCommonStages(f);
    if (common.answered) answeredCount++;
    if (common.intent_captured) intentCapturedCount++;

    const intents = extractIntents(f);
    for (const intent of intents) {
      if (intent === "unknown") continue;
      const acc = accs[intent];
      if (!acc) continue;
      acc.totalCalls++;
      const stages = extractIntentStages(f, intent);
      for (const stage of INTENT_STAGES[intent]) {
        if (stages[stage] === true) acc.stageCounts[stage]++;
      }
      if (stages["goal_achieved"] === true) acc.goalAchievedCount++;
    }
  }

  if (totalCalls === 0) return null;

  const subFunnels: Partial<Record<IntentKey, SubFunnelData>> = {};
  let totalGoalsAchieved = 0;

  for (const intent of TRACKED_INTENTS) {
    const acc = accs[intent];
    if (!acc || acc.totalCalls === 0) continue;

    const stagePercents: Record<string, number> = {};
    for (const stage of INTENT_STAGES[intent]) {
      stagePercents[stage] =
        acc.totalCalls > 0 ? (acc.stageCounts[stage] / acc.totalCalls) * 100 : 0;
    }

    // Biggest drop entre 2 étapes consécutives du sous-funnel.
    let biggestDrop: SubFunnelData["biggestDrop"] = null;
    const stages = INTENT_STAGES[intent];
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const curr = stages[i];
      const dropCount = acc.stageCounts[prev] - acc.stageCounts[curr];
      if (dropCount <= 0) continue;
      const dropPct = stagePercents[prev] - stagePercents[curr];
      if (biggestDrop === null || dropPct > biggestDrop.dropPct) {
        biggestDrop = { stage: curr, prevStage: prev, dropPct, dropCount };
      }
    }

    subFunnels[intent] = {
      intent,
      label: INTENT_LABELS[intent],
      totalCalls: acc.totalCalls,
      goalAchievedCount: acc.goalAchievedCount,
      goalAchievedPct:
        acc.totalCalls > 0
          ? (acc.goalAchievedCount / acc.totalCalls) * 100
          : 0,
      stageCounts: acc.stageCounts,
      stagePercents,
      biggestDrop,
    };
    totalGoalsAchieved += acc.goalAchievedCount;
  }

  return {
    totalCalls,
    answeredCount,
    intentCapturedCount,
    answeredPct: (answeredCount / totalCalls) * 100,
    intentCapturedPct: (intentCapturedCount / totalCalls) * 100,
    subFunnels,
    totalGoalsAchieved,
    // Conversion globale = goals aboutis / total appels (choix user Q3-b) :
    // dénominateur "tous appels", pas "appels avec intent capturé".
    globalConversionPct: (totalGoalsAchieved / totalCalls) * 100,
  };
}

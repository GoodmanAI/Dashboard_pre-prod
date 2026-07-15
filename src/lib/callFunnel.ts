/**
 * Agrégation du funnel de conversion "prise de RDV" par centre.
 *
 * Le bot LyraeTalk pousse pour chaque appel un objet `stats.funnel` avec :
 *   - intent           : catégorie d'appel (prise_rdv, modification_rdv, …)
 *   - stages           : 7 booléens cumulatifs (atteindre N implique 1..N-1)
 *   - drop_stage       : 1re étape non atteinte (le "point de fuite")
 *   - completed        : objectif atteint (booked pour prise_rdv)
 *   - outcome          : completed | transfer | hangup | abandoned
 *
 * On expose ici deux helpers purs :
 *   - computeFunnel(calls)      → agrégation prise_rdv (le funnel principal)
 *   - computeIntentCounts(calls) → compteurs modifs/annulations pour l'annexe
 *
 * Rétrocompat : les vieux appels n'ont pas de `stats.funnel` — on les ignore
 * silencieusement dans les agrégations.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Ordre canonique des 7 étapes du funnel prise_rdv, du plus haut (100 %) au
 * plus bas (objectif atteint). L'ordre est utilisé partout : agrégation,
 * calcul des chutes, rendu visuel.
 */
export const FUNNEL_STAGES = [
  "answered",
  "intent_captured",
  "exam_identified",
  "slot_proposed",
  "slot_accepted",
  "identified",
  "booked",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Libellés FR courts pour l'UI (7 étapes). */
export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  answered: "Accueil",
  intent_captured: "Intention",
  exam_identified: "Examen",
  slot_proposed: "Créneau proposé",
  slot_accepted: "Créneau accepté",
  identified: "Identifié",
  booked: "RDV pris",
};

export type FunnelIntent =
  | "prise_rdv"
  | "modification_rdv"
  | "annulation_rdv"
  | "confirmation_rdv"
  | "consultation_rdv"
  | "unknown";

export type FunnelOutcome = "completed" | "transfer" | "hangup" | "abandoned";

/** Payload brut envoyé par le bot dans `stats.funnel`. */
export type RawFunnel = {
  intent?: FunnelIntent | string;
  stages?: Partial<Record<FunnelStage, boolean>>;
  completed?: boolean;
  furthest_stage?: FunnelStage | string | null;
  drop_stage?: FunnelStage | string | null;
  outcome?: FunnelOutcome | string;
};

/** Résultat de l'agrégation prise_rdv sur une période/centre. */
export type AggregatedFunnel = {
  /** Nb d'appels dont funnel.intent === 'prise_rdv'. Égal à counts.answered. */
  total: number;
  /** Nb d'appels ayant atteint chaque étape (cumulatif). */
  counts: Record<FunnelStage, number>;
  /** % du total pour chaque étape (0 à 100). */
  percents: Record<FunnelStage, number>;
  /** Taux de conversion global = booked / answered × 100. */
  conversionRate: number;
  /**
   * Étape avec la plus grande chute par rapport à la précédente (en points
   * de pourcentage). `null` si aucun drop mesurable (total = 0 ou pas de
   * chute observée).
   */
  biggestDrop: {
    /** Étape ratée (celle qui reçoit moins d'appels que la précédente). */
    stage: FunnelStage;
    /** Étape précédente (celle après laquelle ça chute). */
    prevStage: FunnelStage;
    /** Ampleur de la chute en points de pourcentage du total (0 à 100). */
    dropPct: number;
    /** Nb d'appels perdus entre prevStage et stage. */
    dropCount: number;
  } | null;
  /** Répartition des `drop_stage` (pour tooltip / drill-down futur). */
  dropDistribution: Partial<Record<FunnelStage, number>>;
};

// ============================================================================
// Helpers
// ============================================================================

/** Extrait le funnel typé depuis un objet `stats` arbitraire, ou `null`. */
function extractFunnel(stats: unknown): RawFunnel | null {
  if (!stats || typeof stats !== "object") return null;
  const f = (stats as Record<string, unknown>).funnel;
  if (!f || typeof f !== "object") return null;
  return f as RawFunnel;
}

/** Coerce une étape unknown en `FunnelStage` valide, ou `null`. */
function asStage(v: unknown): FunnelStage | null {
  return typeof v === "string" && (FUNNEL_STAGES as readonly string[]).includes(v)
    ? (v as FunnelStage)
    : null;
}

/**
 * Agrège le funnel `prise_rdv` sur un lot d'appels.
 *
 * Retourne `null` si aucun appel prise_rdv n'a de funnel valide sur la période
 * (le composant UI affichera un état vide plutôt qu'un funnel à 0).
 */
export function computeFunnel(calls: unknown[]): AggregatedFunnel | null {
  const counts: Record<FunnelStage, number> = {
    answered: 0,
    intent_captured: 0,
    exam_identified: 0,
    slot_proposed: 0,
    slot_accepted: 0,
    identified: 0,
    booked: 0,
  };
  const dropDistribution: Partial<Record<FunnelStage, number>> = {};
  let total = 0;

  for (const c of calls) {
    const stats = (c as any)?.stats;
    const f = extractFunnel(stats);
    if (!f || f.intent !== "prise_rdv") continue;
    total++;
    const stages = f.stages ?? {};
    for (const s of FUNNEL_STAGES) {
      if (stages[s] === true) counts[s]++;
    }
    const drop = asStage(f.drop_stage);
    if (drop) dropDistribution[drop] = (dropDistribution[drop] ?? 0) + 1;
  }

  if (total === 0) return null;

  // Base de calcul : counts.answered plutôt que total, car un appel peut
  // techniquement avoir intent='prise_rdv' sans que stages.answered=true
  // (edge case, mais on veut être robuste). En pratique, sur du data bien
  // formé, answered = total.
  const base = counts.answered > 0 ? counts.answered : total;
  const percents = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, base > 0 ? (counts[s] / base) * 100 : 0])
  ) as Record<FunnelStage, number>;

  let biggestDrop: AggregatedFunnel["biggestDrop"] = null;
  for (let i = 1; i < FUNNEL_STAGES.length; i++) {
    const prev = FUNNEL_STAGES[i - 1];
    const curr = FUNNEL_STAGES[i];
    const dropCount = counts[prev] - counts[curr];
    if (dropCount <= 0) continue;
    const dropPct = percents[prev] - percents[curr];
    if (biggestDrop === null || dropPct > biggestDrop.dropPct) {
      biggestDrop = { stage: curr, prevStage: prev, dropPct, dropCount };
    }
  }

  return {
    total,
    counts,
    percents,
    conversionRate: percents.booked,
    biggestDrop,
    dropDistribution,
  };
}

/**
 * Compteurs annexes pour les intents autres que prise_rdv, à afficher sous
 * le funnel principal. Ne compte que les appels ABOUTIS (`completed === true`).
 */
export function computeIntentCounts(calls: unknown[]): {
  modifications: number;
  annulations: number;
  confirmations: number;
} {
  let modifications = 0;
  let annulations = 0;
  let confirmations = 0;
  for (const c of calls) {
    const f = extractFunnel((c as any)?.stats);
    if (!f || f.completed !== true) continue;
    if (f.intent === "modification_rdv") modifications++;
    else if (f.intent === "annulation_rdv") annulations++;
    else if (f.intent === "confirmation_rdv") confirmations++;
  }
  return { modifications, annulations, confirmations };
}

/** Seuil sous lequel on grise le funnel pour signaler un échantillon faible. */
export const FUNNEL_LOW_SAMPLE_THRESHOLD = 5;

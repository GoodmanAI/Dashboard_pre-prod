/**
 * Agrégation du funnel de conversion "prise de RDV" par centre.
 *
 * Le bot LyraeTalk pousse pour chaque appel un objet `stats.funnel` avec :
 *   - intents          : LISTE d'intents détectés pendant l'appel dans l'ordre
 *                        chronologique (ex: ["prise_rdv","confirmation_rdv"]).
 *                        Nouveau champ ; le champ historique `intent` reste
 *                        présent pour rétrocompat et vaut le DERNIER intent.
 *   - intent           : (rétrocompat) dernier intent détecté. Utilisé si
 *                        `intents` est absent.
 *   - stages           : 7 booléens cumulatifs (atteindre N implique 1..N-1)
 *   - drop_stage       : 1re étape non atteinte (le "point de fuite")
 *   - completed        : objectif atteint (booked pour prise_rdv)
 *   - outcome          : completed | transfer | hangup | abandoned
 *
 * Sémantique du funnel (mise à jour 2026-07-20) :
 *   - Étape "Accueil" (answered) = TOUS les appels reçus, quel que soit
 *     l'intent (avant : uniquement prise_rdv). Permet de voir la vraie
 *     conversion "appels reçus → RDV pris".
 *   - Étapes suivantes = uniquement les appels dont `intents` contient
 *     "prise_rdv" (un appel multi-intent peut donc entrer dans le funnel).
 *   - Les % sont exprimés relatifs au total d'appels reçus (pas à
 *     counts.answered), ce qui rend la conversion globale honnête.
 *
 * On expose ici deux helpers purs :
 *   - computeFunnel(calls)      → agrégation avec base "tous les appels"
 *   - computeIntentCounts(calls) → compteurs par intent pour l'annexe.
 *     Un appel multi-intent est compté dans PLUSIEURS compteurs (ex:
 *     prise + confirmation → dans les 2 compteurs).
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
  /**
   * Liste des intents détectés pendant l'appel dans l'ordre chronologique.
   * Nouveau contrat (2026-07-20) : le bot peut envoyer plusieurs intents pour
   * un même appel (ex: le patient prend un RDV puis confirme un RDV
   * existant → ["prise_rdv","confirmation_rdv"]).
   * Si absent, `intent` est utilisé en fallback (mode single-intent legacy).
   */
  intents?: Array<FunnelIntent | string>;
  intent?: FunnelIntent | string;
  stages?: Partial<Record<FunnelStage, boolean>>;
  completed?: boolean;
  furthest_stage?: FunnelStage | string | null;
  drop_stage?: FunnelStage | string | null;
  outcome?: FunnelOutcome | string;
};

/** Résultat de l'agrégation prise_rdv sur une période/centre. */
export type AggregatedFunnel = {
  /**
   * Nb TOTAL d'appels reçus (avec `stats.funnel` défini), tous intents
   * confondus. Base de calcul des pourcentages. Peut être > counts.answered
   * dans le cas rare où un appel a échoué avant même l'étape "answered".
   */
  total: number;
  /**
   * Nb d'appels prise_rdv (contenant "prise_rdv" dans leurs intents). Sous-
   * ensemble de `total` — utile pour afficher "sur X appels prise_rdv, N ont
   * abouti".
   */
  priseRdvCount: number;
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

/**
 * Extrait la liste des intents d'un funnel donné. Priorité au champ `intents`
 * (nouveau, array). Fallback sur `intent` (legacy, string wrappé en tableau).
 * Retourne toujours un array (possiblement vide) — évite les tests null
 * partout dans l'appelant.
 */
function extractIntents(f: RawFunnel): string[] {
  if (Array.isArray(f.intents)) {
    return f.intents.filter((s): s is string => typeof s === "string");
  }
  if (typeof f.intent === "string") return [f.intent];
  return [];
}

/** Coerce une étape unknown en `FunnelStage` valide, ou `null`. */
function asStage(v: unknown): FunnelStage | null {
  return typeof v === "string" && (FUNNEL_STAGES as readonly string[]).includes(v)
    ? (v as FunnelStage)
    : null;
}

/**
 * Agrège le funnel de conversion sur un lot d'appels.
 *
 * Sémantique (2026-07-20) :
 *  - Étape "answered" (Accueil) = TOUS les appels avec `stages.answered=true`,
 *    quel que soit leur intent. Base = total d'appels reçus.
 *  - Étapes suivantes = uniquement les appels dont `intents` contient
 *    "prise_rdv" et qui ont ce stage à true.
 *  - Un appel multi-intent contenant "prise_rdv" (ex: prise + confirmation)
 *    est INCLUS dans le funnel prise_rdv.
 *  - Les pourcentages sont exprimés relatifs au `total` d'appels reçus,
 *    ce qui rend le conversionRate global "vrai" (booked / total).
 *  - La transition Accueil → Intention est EXCLUE du calcul de `biggestDrop` :
 *    c'est un filtre de scope (on retire les non-prise_rdv), pas une fuite
 *    dans le parcours utilisateur.
 *
 * Retourne `null` si aucun appel avec funnel valide sur la période (le
 * composant UI affiche un état vide).
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
  let priseRdvCount = 0;

  for (const c of calls) {
    const stats = (c as any)?.stats;
    const f = extractFunnel(stats);
    if (!f) continue;
    total++;
    const stages = f.stages ?? {};
    const intents = extractIntents(f);
    const isPriseRdv = intents.includes("prise_rdv");

    // Étape "Accueil" : tous les appels avec stages.answered=true, indépendamment
    // de l'intent (on veut le vrai total des appels reçus, pas seulement les
    // prise_rdv).
    if (stages.answered === true) counts.answered++;

    // Étapes 2 à 7 : uniquement les appels contenant "prise_rdv" dans leurs
    // intents (un appel multi-intent avec prise_rdv est bien inclus).
    if (isPriseRdv) {
      priseRdvCount++;
      for (const s of FUNNEL_STAGES) {
        if (s === "answered") continue; // déjà compté ci-dessus
        if (stages[s] === true) counts[s]++;
      }
      const drop = asStage(f.drop_stage);
      if (drop) dropDistribution[drop] = (dropDistribution[drop] ?? 0) + 1;
    }
  }

  if (total === 0) return null;

  const base = total;
  const percents = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, base > 0 ? (counts[s] / base) * 100 : 0])
  ) as Record<FunnelStage, number>;

  // Biggest drop : on exclut la transition answered → intent_captured
  // (c'est un filtre de scope "tous les appels" → "prise_rdv uniquement",
  // pas une fuite dans le parcours d'un même utilisateur).
  let biggestDrop: AggregatedFunnel["biggestDrop"] = null;
  for (let i = 1; i < FUNNEL_STAGES.length; i++) {
    const prev = FUNNEL_STAGES[i - 1];
    const curr = FUNNEL_STAGES[i];
    if (prev === "answered" && curr === "intent_captured") continue;
    const dropCount = counts[prev] - counts[curr];
    if (dropCount <= 0) continue;
    const dropPct = percents[prev] - percents[curr];
    if (biggestDrop === null || dropPct > biggestDrop.dropPct) {
      biggestDrop = { stage: curr, prevStage: prev, dropPct, dropCount };
    }
  }

  return {
    total,
    priseRdvCount,
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
 *
 * Multi-intent : un appel avec `intents = ["prise_rdv", "confirmation_rdv"]`
 * et `completed === true` sera compté dans le funnel prise_rdv ET dans le
 * compteur "confirmations". C'est voulu : chaque intent représente une action
 * réellement effectuée par le bot pendant l'appel.
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
    const intents = extractIntents(f);
    if (intents.includes("modification_rdv")) modifications++;
    if (intents.includes("annulation_rdv")) annulations++;
    if (intents.includes("confirmation_rdv")) confirmations++;
  }
  return { modifications, annulations, confirmations };
}

/** Seuil sous lequel on grise le funnel pour signaler un échantillon faible. */
export const FUNNEL_LOW_SAMPLE_THRESHOLD = 5;

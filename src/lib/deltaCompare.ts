/**
 * Comparaison KPI courant vs période précédente.
 *
 * Helpers purs réutilisables sur n'importe quel KPI numérique du dashboard.
 * Convention :
 *  - `direction` : interprétation métier d'une hausse
 *    - "higher_is_better" → vert quand ↑ (ex : RDV pris, conversion, indice)
 *    - "lower_is_better"  → rouge quand ↑ (ex : transferts, erreurs)
 *    - "neutral"          → gris peu importe le sens (ex : durée moyenne)
 *  - Seuil de pertinence statistique : si la période précédente a moins de
 *    `MIN_PREVIOUS_SAMPLE` événements (defaut 5), on n'affiche pas de delta
 *    pour éviter les "+200%" alarmants quand on passe de 1 à 3.
 */

import {
  differenceInCalendarDays,
  startOfMonth,
  endOfDay,
  startOfDay,
  subDays,
  isSameMonth,
  getDate,
} from "date-fns";

export type DeltaDirection = "higher_is_better" | "lower_is_better" | "neutral";

export const MIN_PREVIOUS_SAMPLE = 5;

/** Résultat de la comparaison — exploité directement par <KpiWithDelta>. */
export type DeltaResult =
  /** Volatile : période précédente trop petite, on n'affiche rien. */
  | { kind: "insufficient"; previous: number }
  /** Valeur strictement égale → "=". */
  | { kind: "equal"; previous: number }
  /** Période précédente vide (=0), courante non vide → "Nouveau". */
  | { kind: "new"; previous: number; current: number }
  /** Variation calculable normalement → "+18%" / "-12%". */
  | {
      kind: "delta";
      previous: number;
      current: number;
      /** Variation en % (peut être négative, arrondie à 1 décimale). */
      pct: number;
      /** "up" | "down" — sens visuel. */
      sign: "up" | "down";
      /** "positive" | "negative" | "neutral" — interprétation métier. */
      tone: "positive" | "negative" | "neutral";
    };

/**
 * Calcule un delta entre une valeur courante et précédente.
 *
 * @param current   Valeur sur la période courante
 * @param previous  Valeur sur la période précédente
 * @param direction Sens "favorable" du KPI
 * @param minSample Seuil de pertinence (défaut MIN_PREVIOUS_SAMPLE)
 */
export function computeDelta(
  current: number,
  previous: number,
  direction: DeltaDirection = "higher_is_better",
  minSample: number = MIN_PREVIOUS_SAMPLE
): DeltaResult {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { kind: "insufficient", previous };
  }
  // Période précédente trop petite : delta non fiable.
  if (previous < minSample && current < minSample) {
    return { kind: "insufficient", previous };
  }
  if (previous === 0 && current === 0) {
    return { kind: "equal", previous };
  }
  if (previous === 0 && current > 0) {
    return { kind: "new", previous, current };
  }
  if (current === previous) {
    return { kind: "equal", previous };
  }
  const rawPct = ((current - previous) / previous) * 100;
  const pct = Math.round(rawPct * 10) / 10;
  const sign: "up" | "down" = rawPct >= 0 ? "up" : "down";
  let tone: "positive" | "negative" | "neutral" = "neutral";
  if (direction === "higher_is_better") tone = sign === "up" ? "positive" : "negative";
  else if (direction === "lower_is_better") tone = sign === "up" ? "negative" : "positive";
  return { kind: "delta", previous, current, pct, sign, tone };
}

/**
 * Calcule la période de comparaison à partir d'un range.
 *
 *  - 1 jour exactement → pas de période précédente (delta non pertinent)
 *  - Range qui couvre EXACTEMENT le mois en cours (1er → aujourd'hui) →
 *    comparer à la même portion du mois précédent (1er → jour J du mois N-1)
 *  - Tout le reste → durée identique juste avant `from`
 *
 * Retourne `null` si la comparaison n'a pas de sens (single day).
 */
export function computePreviousRange(
  from: Date,
  to: Date,
  now: Date = new Date()
): { from: Date; to: Date; label: string } | null {
  const days = differenceInCalendarDays(to, from) + 1;
  if (days <= 1) return null;

  // Détection "mois en cours" : from = 1er du mois, to = today ou after.
  const monthStart = startOfMonth(now);
  const isCurrentMonthRange =
    isSameMonth(from, now) &&
    getDate(from) === 1 &&
    isSameMonth(to, now) &&
    from.getTime() === startOfDay(monthStart).getTime();

  if (isCurrentMonthRange) {
    // Compare au même nombre de jours du mois précédent (1er → jour J).
    const dayOfMonth = getDate(now);
    const prevMonthStart = startOfMonth(subDays(monthStart, 1));
    const prevFrom = startOfDay(prevMonthStart);
    const prevTo = endOfDay(
      new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), dayOfMonth)
    );
    return {
      from: prevFrom,
      to: prevTo,
      label: `du ${formatShort(prevFrom)} au ${formatShort(prevTo)}`,
    };
  }

  // Cas général : durée identique juste avant `from`.
  const prevTo = endOfDay(subDays(from, 1));
  const prevFrom = startOfDay(subDays(prevTo, days - 1));
  return {
    from: prevFrom,
    to: prevTo,
    label: `du ${formatShort(prevFrom)} au ${formatShort(prevTo)}`,
  };
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

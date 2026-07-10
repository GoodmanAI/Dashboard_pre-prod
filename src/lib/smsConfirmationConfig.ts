export const EXAM_TYPE_KEYS = [
  "radiographie",
  "irm",
  "echographie",
  "scanner",
  "mammo",
] as const;

export type ExamTypeKey = (typeof EXAM_TYPE_KEYS)[number];

export type SmsConfirmationEnabled = Record<ExamTypeKey, boolean>;

export const DEFAULT_SMS_CONFIRMATION_ENABLED: SmsConfirmationEnabled = {
  radiographie: false,
  irm: false,
  echographie: false,
  scanner: false,
  mammo: false,
};

/**
 * Mapping type d'examen → liste de NumeroPoste Xplore.
 * Partial : un type peut ne pas avoir de postes définis (liste vide implicite).
 */
export type PostesByType = Partial<Record<ExamTypeKey, string[]>>;

export const DEFAULT_POSTES_BY_TYPE: PostesByType = {};

// Bornes de validation — évitent des valeurs délirantes qui casseraient le cron.
export const REMINDER_DAY_MAX = 30;
export const CUTOFF_HOURS_MAX = 168; // 7 jours
export const POSTE_MAX_LENGTH = 32;
export const POSTES_PER_TYPE_MAX = 32;

/**
 * Normalise un JSON arbitraire venant de la DB : ne garde que les clés connues,
 * coerce en booléen, complète les manquantes avec `false`. Garantit qu'aucune
 * clé inconnue ne fuit côté API.
 */
export function normalizeEnabled(raw: unknown): SmsConfirmationEnabled {
  const out: SmsConfirmationEnabled = { ...DEFAULT_SMS_CONFIRMATION_ENABLED };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const k of EXAM_TYPE_KEYS) {
      if (k in obj) out[k] = Boolean(obj[k]);
    }
  }
  return out;
}

/**
 * Normalise un JSON arbitraire → PostesByType.
 * - Ne garde que les clés d'exam types connus.
 * - Pour chaque clé : force en tableau, trim les strings, drop vides/doublons,
 *   borne à POSTES_PER_TYPE_MAX entrées, borne chaque poste à POSTE_MAX_LENGTH.
 * - Si `restrictTo` fourni (Array ou Set), ne retourne que les postes des
 *   types listés (utile pour ne pas exposer les postes des types désactivés).
 */
export function normalizePostesByType(
  raw: unknown,
  restrictTo?: ReadonlySet<ExamTypeKey> | ReadonlyArray<ExamTypeKey>
): PostesByType {
  const out: PostesByType = {};
  if (!raw || typeof raw !== "object") return out;

  const allowed: ReadonlySet<ExamTypeKey> | null = restrictTo
    ? Array.isArray(restrictTo)
      ? new Set(restrictTo)
      : (restrictTo as ReadonlySet<ExamTypeKey>)
    : null;

  const obj = raw as Record<string, unknown>;
  for (const k of EXAM_TYPE_KEYS) {
    if (allowed && !allowed.has(k)) continue;
    const arr = obj[k];
    if (!Array.isArray(arr)) continue;
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      const t = v.trim().slice(0, POSTE_MAX_LENGTH);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      clean.push(t);
      if (clean.length >= POSTES_PER_TYPE_MAX) break;
    }
    if (clean.length > 0) out[k] = clean;
  }
  return out;
}

/**
 * Normalise reminderDays : tableau d'entiers entre 1 et REMINDER_DAY_MAX,
 * déduplique, trie décroissant (le plus loin d'abord, ex: [3, 2] pour J-3 puis J-2).
 * Retourne null si input invalide ou vide.
 */
export function normalizeReminderDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<number>();
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    const i = Math.trunc(n);
    if (i <= 0 || i > REMINDER_DAY_MAX) continue;
    seen.add(i);
  }
  if (seen.size === 0) return null;
  return Array.from(seen).sort((a, b) => b - a);
}

/**
 * Normalise cutoffHours : entier entre 0 et CUTOFF_HOURS_MAX.
 * Retourne null si input invalide.
 */
export function normalizeCutoffHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 0 || i > CUTOFF_HOURS_MAX) return null;
  return i;
}

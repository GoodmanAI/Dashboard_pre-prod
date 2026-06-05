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

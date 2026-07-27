/**
 * Config no-show ordonnances par centre : quels types d'examens necessitent
 * une ordonnance, et au bout de combien de temps sans depot on leve une
 * alerte cote secretariat.
 *
 * Meme pattern que `smsConfirmationConfig.ts` (types d'examens canoniques
 * identiques, normalisation stricte a la lecture, defaut opt-in explicite).
 */

import { EXAM_TYPE_KEYS, ExamTypeKey } from "./smsConfirmationConfig";

/**
 * Types d'examens qui requierent une ordonnance dans ce centre.
 * Reutilise strictement les 5 memes cles que le no-show — un centre parametre
 * en une seule fois ses types canoniques, on evite les incoherences.
 */
export type PrescriptionEnabledExamTypes = Record<ExamTypeKey, boolean>;

export const DEFAULT_PRESCRIPTION_ENABLED: PrescriptionEnabledExamTypes = {
  radiographie: false,
  irm: false,
  echographie: false,
  scanner: false,
  mammo: false,
};

/**
 * Delai avant qu'une alerte "ordonnance manquante" apparaisse dans le
 * dashboard secretaire. Defaut 48h, bornes 1-720h (30j max) enforce par
 * un CHECK constraint cote DB en plus.
 */
export const DEFAULT_ALERT_AFTER_HOURS = 48;
export const ALERT_AFTER_HOURS_MIN = 1;
export const ALERT_AFTER_HOURS_MAX = 720;

/**
 * Normalise un JSON arbitraire venant de la DB : ne garde que les cles
 * canoniques, coerce en boolean, complete les manquantes avec `false`.
 * Garantit qu'aucune cle inconnue ne fuit cote API.
 */
export function normalizePrescriptionEnabled(
  raw: unknown
): PrescriptionEnabledExamTypes {
  const out: PrescriptionEnabledExamTypes = { ...DEFAULT_PRESCRIPTION_ENABLED };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const k of EXAM_TYPE_KEYS) {
      if (k in obj) out[k] = Boolean(obj[k]);
    }
  }
  return out;
}

/**
 * Normalise alertAfterHours : entier borne entre ALERT_AFTER_HOURS_MIN et
 * ALERT_AFTER_HOURS_MAX. Retourne DEFAULT si input invalide (au lieu de
 * null : le champ a toujours une valeur car il a une valeur par defaut en DB).
 */
export function normalizeAlertAfterHours(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ALERT_AFTER_HOURS;
  const i = Math.trunc(n);
  if (i < ALERT_AFTER_HOURS_MIN || i > ALERT_AFTER_HOURS_MAX) {
    return DEFAULT_ALERT_AFTER_HOURS;
  }
  return i;
}

/**
 * Une ordonnance est requise pour ce RDV si :
 *   - un examType est fourni ET
 *   - il fait partie des types canoniques ET
 *   - il est active dans la config du centre
 *
 * Utilise par LyraeTalk apres booking pour decider s'il faut appeler
 * /api/prescriptions/init avant d'envoyer le SMS de confirmation.
 */
export function isPrescriptionRequired(
  examType: string | null | undefined,
  config: PrescriptionEnabledExamTypes
): boolean {
  if (!examType || typeof examType !== "string") return false;
  if (!(EXAM_TYPE_KEYS as readonly string[]).includes(examType)) return false;
  return config[examType as ExamTypeKey] === true;
}

/**
 * Catégorisation des appels "raccroché" par étape du flow où le patient a
 * abandonné. Le bot envoie `stats.last_state` (état du bot au moment de la fin
 * d'appel). On regroupe ces états en "raisons probables de raccrochage" pour
 * pouvoir distinguer un raccrochage "créneaux non correspondants" (le patient
 * a entendu les créneaux mais aucun ne convenait) d'un raccrochage "Renoncement
 * à l'identification" (le patient n'a pas voulu donner ses infos).
 *
 * Vue ordonnée du plus tardif (RDV presque pris) au plus précoce dans le flow.
 */

export type HangupContextKey =
  | "no_matching_slot"
  | "renounced_validation"
  | "renounced_questions"
  | "renounced_multi_exam"
  | "renounced_identification"
  | "renounced_intent_or_exam"
  | "renounced_cancel_modify"
  | "left_consultation"
  | "early_hangup"
  | "unknown";

export type HangupContextMeta = {
  key: HangupContextKey;
  label: string;
  /** Description courte affichée en tooltip / sublabel. */
  description: string;
  /** Couleur d'accent pour chips/charts. */
  color: string;
  /** Étapes (`last_state`) appartenant à cette catégorie. */
  lastStates: string[];
};

export const HANGUP_CONTEXTS: HangupContextMeta[] = [
  {
    key: "no_matching_slot",
    label: "Créneaux non correspondants",
    description: "Le patient a entendu les créneaux proposés mais aucun ne lui convenait.",
    color: "#ef4444",
    lastStates: [
      "slot",
      "slot_double",
      "get_dispo",
      "get_dispo_double",
      "get_period",
      "get_period_double",
      "no_slot_modify_proposal",
    ],
  },
  {
    key: "renounced_validation",
    label: "Renoncement à la validation",
    description: "Hésitation au dernier moment avant la confirmation finale du RDV.",
    color: "#f97316",
    lastStates: ["validate_exam", "validate_double_exam"],
  },
  {
    key: "renounced_questions",
    label: "Renoncement aux questions",
    description: "Abandon durant les questions pré-examen (allergies, contre-indications, etc.).",
    color: "#f59e0b",
    lastStates: [
      "exam_questions",
      "define_mammo",
      "irm_injection_flow",
      "scanner_injection_flow",
      "ask_allergy",
      "ask_injection",
      "ask_irm_contraindication",
    ],
  },
  {
    key: "renounced_multi_exam",
    label: "Renoncement sur multi-examens",
    description: "Abandon durant la gestion d'examens multiples (combos).",
    color: "#a855f7",
    lastStates: [
      "multi_exam_confirm",
      "multi_exam_get_region",
      "multi_exam_one_not_accepted",
      "multi_exam_validate",
    ],
  },
  {
    key: "renounced_identification",
    label: "Renoncement à l'identification",
    description: "Raccrochage au moment où le bot demande l'identité (nom, prénom, date de naissance).",
    color: "#4899B5",
    lastStates: [
      "identification_birthdate",
      "identification_firstname",
      "identification_lastname",
      "identification_confirm",
      "identification_birthdate_light",
      "identification_firstname_light",
      "identification_lastname_light",
      "identification_confirm_light",
      "confirm_identity_rdv",
      "get_phone",
      "confirm_phone",
    ],
  },
  {
    key: "renounced_intent_or_exam",
    label: "Renoncement intention / examen",
    description: "Abandon en début de flow, avant ou pendant le choix de l'examen.",
    color: "#06b6d4",
    lastStates: [
      "get_intent",
      "confirm_intent",
      "exam_type",
      "confirm_exam",
      "get_motif",
    ],
  },
  {
    key: "renounced_cancel_modify",
    label: "Renoncement annulation / modification",
    description: "Abandon en cours d'annulation ou de modification d'un RDV.",
    color: "#6b7280",
    lastStates: ["cancel_fetch", "cancel_confirm", "modify_fetch", "modify_confirm"],
  },
  {
    key: "left_consultation",
    label: "Quitté après consultation",
    description: "Le patient a obtenu l'info qu'il cherchait via la consultation puis a raccroché.",
    color: "#22c55e",
    lastStates: ["consultation"],
  },
  {
    key: "early_hangup",
    label: "Raccrochage immédiat",
    description: "Raccrochage très précoce, avant le début du flow métier.",
    color: "#94a3b8",
    lastStates: ["welcome", "start", "init"],
  },
];

/** Lookup last_state → contexte (pré-construit pour O(1)). */
const STATE_TO_CONTEXT: Record<string, HangupContextMeta> = (() => {
  const acc: Record<string, HangupContextMeta> = {};
  for (const ctx of HANGUP_CONTEXTS) {
    for (const s of ctx.lastStates) acc[s] = ctx;
  }
  return acc;
})();

export const UNKNOWN_HANGUP_CONTEXT: HangupContextMeta = {
  key: "unknown",
  label: "Raccrochage indéterminé",
  description: "L'étape exacte de raccrochage n'a pas pu être déterminée.",
  color: "#9ca3af",
  lastStates: [],
};

/**
 * Détermine si un appel correspond à un "raccroché" — défini comme :
 *   pas de RDV (booked/canceled/modified === 0) ET pas un transfert secrétariat.
 *
 * Critère STRICTEMENT identique à la logique d'affichage du chip "Raccroché"
 * sur la page liste des appels (cf. getCallChips) : comparaison `=== 0` sans
 * fallback, donc un champ undefined/null ne déclenche PAS le bucket "Raccroché".
 */
export function isHangup(stats: any): boolean {
  if (!stats) return false;
  if (stats.end_reason === "transfer") return false;
  return (
    stats.rdv_booked === 0 &&
    stats.rdv_canceled === 0 &&
    stats.rdv_modified === 0
  );
}

/**
 * Retourne le contexte du raccrochage à partir des stats. Retourne null si
 * l'appel n'est pas un raccrochage. Tolère un last_state inconnu → bucket
 * `unknown` (signal au futur de revoir le mapping si fréquent).
 */
export function getHangupContext(stats: any): HangupContextMeta | null {
  if (!isHangup(stats)) return null;
  const ls = stats?.last_state;
  if (typeof ls === "string" && STATE_TO_CONTEXT[ls]) return STATE_TO_CONTEXT[ls];
  return UNKNOWN_HANGUP_CONTEXT;
}

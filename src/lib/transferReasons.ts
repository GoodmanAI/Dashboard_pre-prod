/**
 * Mapping mutualisé `transferReason` → libellé + catégorie.
 *
 * Source de vérité pour TOUTE l'app (chips liste des appels, camemberts stats,
 * widget incompréhension côté admin, etc.). Quand le bot ajoute une nouvelle
 * valeur, on l'ajoute ici et tout suit automatiquement.
 *
 * Tolérance aux valeurs inconnues : `getTransferMeta(reason)` retombe sur la
 * catégorie `"autre"` sans casser ni nécessiter un patch immédiat.
 */

export type TransferCategory =
  | "demande_patient"
  | "examen_non_traitable"
  | "patient_introuvable"
  | "incomprehension_etape"
  | "pas_de_creneau"
  | "erreur_technique"
  | "non_transfert"
  | "autre";

export type TransferMeta = {
  label: string;
  category: TransferCategory;
};

/**
 * Métadonnées par catégorie : libellé human-readable, couleur de chip/chart,
 * couleur de texte associée pour fond clair.
 */
export const CATEGORY_META: Record<
  TransferCategory,
  { label: string; color: string; bg: string; textColor: string }
> = {
  demande_patient: {
    label: "Demande patient",
    color: "#4899B5",
    bg: "rgba(72,155,181,0.15)",
    textColor: "#1e5a73",
  },
  examen_non_traitable: {
    label: "Examen non traitable",
    color: "#fdba74",
    bg: "rgba(253,186,116,0.20)",
    textColor: "#9a3412",
  },
  patient_introuvable: {
    label: "Patient introuvable",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.20)",
    textColor: "#5b21b6",
  },
  incomprehension_etape: {
    label: "Incompréhension étape",
    color: "#f97316",
    bg: "rgba(249,115,22,0.18)",
    textColor: "#9a3412",
  },
  pas_de_creneau: {
    label: "Pas de créneau",
    color: "#D4BFC7",
    bg: "rgba(212,191,199,0.30)",
    textColor: "#7c2d4d",
  },
  erreur_technique: {
    label: "Erreur technique",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.18)",
    textColor: "#b91c1c",
  },
  non_transfert: {
    label: "Non transfert",
    color: "#9ca3af",
    bg: "rgba(156,163,175,0.20)",
    textColor: "#374151",
  },
  autre: {
    label: "Autre",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.18)",
    textColor: "#374151",
  },
};

/**
 * Toutes les `transferReason` connues — alimenter ici à chaque nouvelle valeur
 * remontée par le bot. Les anciennes valeurs (avant refacto bot) sont conservées
 * pour rétro-compat sur les appels historiques en BDD.
 */
export const TRANSFER_REASON_META: Record<string, TransferMeta> = {
  // ===== demande_patient =====
  redirect: { label: "Redirection (demande / examen redirigé)", category: "demande_patient" },
  admin: { label: "Démarche administrative", category: "demande_patient" },
  result: { label: "Demande de résultats", category: "demande_patient" },
  incident: { label: "Incident / réclamation", category: "demande_patient" },
  doctor: { label: "Médecin / professionnel de santé", category: "demande_patient" },
  emergency: { label: "Urgence médicale", category: "demande_patient" },
  human_requested: { label: "Demande d'un humain", category: "demande_patient" },

  // ===== examen_non_traitable =====
  exam_type: { label: "Examen non disponible (non mappé)", category: "examen_non_traitable" },
  exam_not_practiced: { label: "Examen non pratiqué par le centre", category: "examen_non_traitable" },
  exam_interv: { label: "Examen interventionnel", category: "examen_non_traitable" },
  exam_mult: { label: "Examen multiple non géré", category: "examen_non_traitable" },
  doppler_off_catalog: { label: "Doppler hors catalogue", category: "examen_non_traitable" },
  doppler_disambiguation: { label: "Doppler : désambiguïsation échouée", category: "examen_non_traitable" },
  doppler_disambiguation_loop: { label: "Doppler : boucle de désambiguïsation", category: "examen_non_traitable" },
  // Rétro-compat anciennes valeurs
  multi_exam_not_accepted: { label: "Examens multiples non gérés", category: "examen_non_traitable" },
  multi_examen_double_us: { label: "Double échographie non gérée", category: "examen_non_traitable" },

  // ===== patient_introuvable =====
  patient_not_found: { label: "Dossier patient introuvable", category: "patient_introuvable" },
  identification: { label: "Échec d'identification", category: "patient_introuvable" },
  confirm_identity_rdv: { label: "Échec confirmation identité RDV", category: "patient_introuvable" },
  // Rétro-compat
  error_identification: { label: "Erreur d'identification", category: "patient_introuvable" },

  // ===== incomprehension_etape =====
  error_logic: { label: "Trop d'erreurs (limite globale)", category: "incomprehension_etape" },
  get_birthdate: { label: "Échec date de naissance", category: "incomprehension_etape" },
  get_firstname: { label: "Échec prénom", category: "incomprehension_etape" },
  get_lastname: { label: "Échec nom", category: "incomprehension_etape" },
  get_phone: { label: "Échec téléphone", category: "incomprehension_etape" },
  confirm_phone: { label: "Échec confirmation téléphone", category: "incomprehension_etape" },
  check_adult: { label: "Échec majeur/mineur", category: "incomprehension_etape" },
  ask_allergy: { label: "Allergie produit de contraste", category: "incomprehension_etape" },
  allergy_contrast: { label: "Allergie produit de contraste", category: "incomprehension_etape" },
  ask_injection: { label: "Question injection", category: "incomprehension_etape" },
  ask_irm_contraindication: { label: "Contre-indication IRM", category: "incomprehension_etape" },
  irm_contraindication: { label: "Contre-indication IRM", category: "incomprehension_etape" },
  exam_questions: { label: "Questions pré-examen", category: "incomprehension_etape" },
  define_mammo: { label: "Définition mammographie", category: "incomprehension_etape" },
  ask_radiologue_choice: { label: "Choix du radiologue", category: "incomprehension_etape" },
  ask_site: { label: "Choix du centre", category: "incomprehension_etape" },
  ask_language: { label: "Choix de la langue", category: "incomprehension_etape" },
  context_confirm: { label: "Confirmation correction", category: "incomprehension_etape" },
  confirm_action: { label: "Échec confirmation action", category: "incomprehension_etape" },
  modify_confirm: { label: "Échec confirmation modification", category: "incomprehension_etape" },
  cancel_confirm: { label: "Échec confirmation annulation", category: "incomprehension_etape" },
  multisite_preference: { label: "Préférence multi-site", category: "incomprehension_etape" },
  no_slot_modify_proposal: { label: "Échec proposition créneau (modif)", category: "incomprehension_etape" },
  too_many_errors: { label: "Trop d'erreurs (radiologue/examen dupliqué)", category: "incomprehension_etape" },

  // ===== pas_de_creneau =====
  no_patient_slot_find: { label: "Aucun créneau ne convient", category: "pas_de_creneau" },
  no_slots_modify: { label: "Pas de créneau (modification)", category: "pas_de_creneau" },
  full_planning_redirect: { label: "Planning complet", category: "pas_de_creneau" },

  // ===== erreur_technique =====
  error: { label: "Erreur technique API", category: "erreur_technique" },
  confirm_rdv_failed: { label: "Échec confirmation RDV", category: "erreur_technique" },
  cancel_failed: { label: "Échec annulation RDV", category: "erreur_technique" },
  validate_double_exam: { label: "Échec double booking", category: "erreur_technique" },
  init_failed: { label: "Configuration indisponible", category: "erreur_technique" },
  service_disabled: { label: "Service désactivé (site)", category: "erreur_technique" },
  error_system: { label: "Erreur système", category: "erreur_technique" },
  // Rétro-compat
  create_rdv_failed: { label: "Échec de création de RDV", category: "erreur_technique" },

  // ===== non_transfert (à EXCLURE du décompte transferts) =====
  end_conversation: { label: "Fin de conversation (raccrochage)", category: "non_transfert" },
  info: { label: "Renseignement donné", category: "non_transfert" },
};

/**
 * Résout les métadonnées d'un `transferReason`. Tolère les valeurs inconnues :
 * retombe sur catégorie `"autre"` avec le code brut comme label.
 * Loggue une fois côté serveur (sans spammer) pour signaler une valeur à
 * ajouter dans le mapping.
 */
const warnedUnknown = new Set<string>();
export function getTransferMeta(reason: string | null | undefined): TransferMeta & {
  isKnown: boolean;
} {
  if (!reason) {
    return { label: "Sans raison", category: "autre", isKnown: false };
  }
  const known = TRANSFER_REASON_META[reason];
  if (known) return { ...known, isKnown: true };

  // Tolérance : on bucket en "autre" + log une fois côté serveur.
  if (typeof window === "undefined" && !warnedUnknown.has(reason)) {
    warnedUnknown.add(reason);
    console.warn(`[transferReasons] valeur inconnue : "${reason}" — ajouter au mapping`);
  }
  return { label: reason, category: "autre", isKnown: false };
}

/**
 * Détermine si un appel doit être compté comme un "vrai" transfert vers
 * secrétariat. Règle : end_reason === 'transfer' ET le transferReason n'est
 * pas dans la catégorie `non_transfert`.
 */
export function isCounterTransfer(stats: any): boolean {
  if (!stats || stats.end_reason !== "transfer") return false;
  const meta = getTransferMeta(stats.transferReason);
  return meta.category !== "non_transfert";
}

/**
 * Liste des catégories ordonnées pour l'affichage (du plus "actionnable" pour
 * un centre au moins actionnable, en gros).
 */
export const CATEGORY_ORDER: TransferCategory[] = [
  "examen_non_traitable",
  "incomprehension_etape",
  "pas_de_creneau",
  "demande_patient",
  "patient_introuvable",
  "erreur_technique",
  "autre",
];

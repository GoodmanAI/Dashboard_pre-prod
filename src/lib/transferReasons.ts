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
    label: "Demande du patient",
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
    label: "Le robot n'a pas compris",
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
    label: "Pas un transfert",
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
  redirect: { label: "Secrétariat demandé ou examen redirigé", category: "demande_patient" },
  admin: { label: "Démarche administrative", category: "demande_patient" },
  result: { label: "Demande de résultats", category: "demande_patient" },
  incident: { label: "Incident ou réclamation", category: "demande_patient" },
  doctor: { label: "Médecin ou professionnel de santé", category: "demande_patient" },
  emergency: { label: "Urgence médicale", category: "demande_patient" },
  human_requested: { label: "Le patient a demandé une personne", category: "demande_patient" },
  context_router_human: { label: "Le patient a demandé une personne", category: "demande_patient" },
  urgence_detected: { label: "Urgence médicale", category: "demande_patient" },
  limite_actions_rdv: { label: "Trop de demandes dans le même appel", category: "demande_patient" },
  // Valeurs rangées en « Autre » jusqu'au 21/10/2026, faute de libellé.
  confirmation_ecrite: { label: "Confirmation écrite demandée", category: "demande_patient" },
  transport: { label: "Question sur le transport", category: "demande_patient" },
  v2_abandon: { label: "Le patient abandonne sa demande", category: "demande_patient" },
  radiologue_specific_required: { label: "Radiologue précis demandé", category: "demande_patient" },
  // Robot V1 : la confirmation de rendez-vous passait au secrétariat.
  rdv_confirmation: { label: "Confirmation de rendez-vous", category: "demande_patient" },

  // ===== examen_non_traitable =====
  exam_type: { label: "Examen que le robot ne prend pas", category: "examen_non_traitable" },
  exam_not_practiced: { label: "Examen non pratiqué par le centre", category: "examen_non_traitable" },
  exam_interv: { label: "Examen de radiologie interventionnelle", category: "examen_non_traitable" },
  exam_mult: { label: "Plusieurs examens dans le même appel", category: "examen_non_traitable" },
  doppler_off_catalog: { label: "Doppler absent du catalogue du centre", category: "examen_non_traitable" },
  doppler_disambiguation: { label: "Type de doppler non compris", category: "examen_non_traitable" },
  doppler_disambiguation_loop: { label: "Type de doppler non compris après plusieurs essais", category: "examen_non_traitable" },
  multi_exam_one_refused: { label: "Un des examens n'est pas pris en charge", category: "examen_non_traitable" },
  // Rétro-compat anciennes valeurs
  multi_exam_not_accepted: { label: "Plusieurs examens non acceptés ensemble", category: "examen_non_traitable" },
  multi_examen_double_us: { label: "Deux échographies non acceptées ensemble", category: "examen_non_traitable" },
  // Le robot écrit `multi_examen_…` (validateMultiExams.js) : la clé `multi_exam_not_accepted`
  // ci-dessus ne l'a jamais attrapé, 107 appels étaient rangés en « Autre » au 21/10/2026.
  multi_examen_not_accepted: { label: "Plusieurs examens non acceptés ensemble", category: "examen_non_traitable" },
  multi_examen_double_rx: { label: "Deux radios non acceptées ensemble", category: "examen_non_traitable" },

  // ===== patient_introuvable =====
  patient_not_found: { label: "Dossier patient introuvable", category: "patient_introuvable" },
  identification: { label: "Patient non identifié", category: "patient_introuvable" },
  confirm_identity_rdv: { label: "Identité du patient non confirmée", category: "patient_introuvable" },
  // Rétro-compat
  error_identification: { label: "Patient non identifié", category: "patient_introuvable" },
  rdv_introuvable: { label: "Rendez-vous introuvable", category: "patient_introuvable" },
  no_rdv_new_patient: { label: "Aucun rendez-vous (nouveau patient)", category: "patient_introuvable" },

  // ===== incomprehension_etape =====
  error_logic: { label: "Trop d'incompréhensions dans l'appel", category: "incomprehension_etape" },
  get_birthdate: { label: "Date de naissance non comprise", category: "incomprehension_etape" },
  get_firstname: { label: "Prénom non compris", category: "incomprehension_etape" },
  get_lastname: { label: "Nom non compris", category: "incomprehension_etape" },
  get_phone: { label: "Numéro de téléphone non compris", category: "incomprehension_etape" },
  confirm_phone: { label: "Numéro de téléphone non confirmé", category: "incomprehension_etape" },
  check_adult: { label: "Âge du patient non compris (majeur ou mineur)", category: "incomprehension_etape" },
  ask_allergy: { label: "Réponse sur l'allergie non comprise", category: "incomprehension_etape" },
  allergy_contrast: { label: "Allergie au produit de contraste", category: "incomprehension_etape" },
  ask_injection: { label: "Réponse sur l'injection non comprise", category: "incomprehension_etape" },
  ask_irm_contraindication: { label: "Réponse sur les contre-indications IRM non comprise", category: "incomprehension_etape" },
  irm_contraindication: { label: "Contre-indication à l'IRM", category: "incomprehension_etape" },
  exam_questions: { label: "Réponses avant l'examen non comprises", category: "incomprehension_etape" },
  define_mammo: { label: "Type de mammographie non compris", category: "incomprehension_etape" },
  ask_radiologue_choice: { label: "Choix du radiologue non compris", category: "incomprehension_etape" },
  ask_site: { label: "Choix du centre non compris", category: "incomprehension_etape" },
  ask_language: { label: "Choix de la langue non compris", category: "incomprehension_etape" },
  context_confirm: { label: "Correction du patient non confirmée", category: "incomprehension_etape" },
  confirm_action: { label: "Confirmation de la demande non comprise", category: "incomprehension_etape" },
  modify_confirm: { label: "Confirmation de la modification non comprise", category: "incomprehension_etape" },
  cancel_confirm: { label: "Confirmation de l'annulation non comprise", category: "incomprehension_etape" },
  multisite_preference: { label: "Choix entre les centres non compris", category: "incomprehension_etape" },
  no_slot_modify_proposal: { label: "Nouveau créneau non compris (modification)", category: "incomprehension_etape" },
  too_many_errors: { label: "Trop d'incompréhensions (radiologue ou examen en double)", category: "incomprehension_etape" },
  intent_unclear: { label: "Demande non comprise", category: "incomprehension_etape" },
  exam_unclear: { label: "Examen demandé non compris", category: "incomprehension_etape" },
  slot_multi: { label: "Choix du créneau non compris", category: "incomprehension_etape" },
  context_router_cancel: { label: "Correction non comprise", category: "incomprehension_etape" },
  grossesse: { label: "Grossesse possible", category: "incomprehension_etape" },
  ask_pregnancy: { label: "Réponse sur la grossesse non comprise", category: "incomprehension_etape" },
  allergy_unsure: { label: "Allergie possible, le patient n'est pas sûr", category: "incomprehension_etape" },
  rdv_date_ambigue: { label: "Date du rendez-vous pas claire", category: "incomprehension_etape" },
  annulation_contestee: { label: "Annulation contestée par le patient", category: "incomprehension_etape" },

  // ===== pas_de_creneau =====
  no_patient_slot_find: { label: "Aucun créneau ne convient", category: "pas_de_creneau" },
  no_slots_modify: { label: "Aucun créneau pour la modification", category: "pas_de_creneau" },
  full_planning_redirect: { label: "Planning complet", category: "pas_de_creneau" },
  full_planning_end: { label: "Planning complet (appel terminé)", category: "pas_de_creneau" },
  no_double_slots: { label: "Pas de créneaux à la suite pour deux examens", category: "pas_de_creneau" },

  // ===== erreur_technique =====
  error: { label: "Erreur technique", category: "erreur_technique" },
  confirm_rdv_failed: { label: "Confirmation du rendez-vous non enregistrée", category: "erreur_technique" },
  cancel_failed: { label: "Annulation non enregistrée", category: "erreur_technique" },
  validate_double_exam: { label: "Deux rendez-vous à la suite non enregistrés", category: "erreur_technique" },
  init_failed: { label: "Réglages du robot indisponibles", category: "erreur_technique" },
  service_disabled: { label: "Robot désactivé pour ce centre", category: "erreur_technique" },
  error_system: { label: "Panne du robot", category: "erreur_technique" },
  error_timeout: { label: "Temps de réponse dépassé", category: "erreur_technique" },
  error_intent: { label: "Panne de la compréhension de la demande", category: "erreur_technique" },
  error_no_slots: { label: "Créneaux impossibles à lire", category: "erreur_technique" },
  edit_rdv_failed: { label: "Modification non enregistrée", category: "erreur_technique" },
  // Rétro-compat
  create_rdv_failed: { label: "Rendez-vous non enregistré", category: "erreur_technique" },
  // LyraeTalk v2.42.0 : lectures dans le logiciel du centre en échec, le patient est transféré en le sachant.
  get_rdv_failed: { label: "Rendez-vous du patient impossibles à lire", category: "erreur_technique" },
  get_slots_failed: { label: "Planning impossible à lire", category: "erreur_technique" },
  search_patient_failed: { label: "Dossier patient impossible à lire", category: "erreur_technique" },
  // createRDV.js : le logiciel du centre refuse le rendez-vous pour un réglage à corriger.
  config_avs_requis: { label: "Rendez-vous refusé : numéro AVS exigé", category: "erreur_technique" },
  config_ipp_incompatible: { label: "Rendez-vous refusé : dossier patient incompatible", category: "erreur_technique" },
  config_caracteristique_rdv: { label: "Rendez-vous refusé : réglage du rendez-vous manquant", category: "erreur_technique" },
  config_external_user: { label: "Rendez-vous refusé : compte du robot non reconnu", category: "erreur_technique" },

  // ===== non_transfert (à EXCLURE du décompte transferts) =====
  end_conversation: { label: "Fin de l'appel", category: "non_transfert" },
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
    return { label: "Motif non enregistré", category: "autre", isKnown: false };
  }
  const known = TRANSFER_REASON_META[reason];
  if (known) return { ...known, isKnown: true };

  // Tolérance : on bucket en "autre" + log une fois côté serveur.
  if (typeof window === "undefined" && !warnedUnknown.has(reason)) {
    warnedUnknown.add(reason);
    console.warn(`[transferReasons] valeur inconnue : "${reason}", ajouter au mapping`);
  }
  return { label: reason, category: "autre", isKnown: false };
}

/**
 * Les fins d'appel où le robot a passé la main au secrétariat. LyraeTalk écrit
 * `end_bridge_not_responsed` quand le secrétariat n'a pas décroché
 * (`giveUpTransfer`, voip.service.js) : c'est un transfert quand même. Avant le
 * 21/10/2026 ces appels (environ 15 % des transferts) étaient comptés comme des
 * raccrochés.
 */
const FINS_DE_TRANSFERT = new Set(["transfer", "end_bridge_not_responsed"]);
export const FINS_DE_TRANSFERT_LISTE = Array.from(FINS_DE_TRANSFERT);

/** Le robot a-t-il transféré l'appel, que le secrétariat ait décroché ou non ? */
export function estUnTransfert(stats: any): boolean {
  return !!stats && FINS_DE_TRANSFERT.has(stats.end_reason);
}

/** Transféré, mais le secrétariat n'a pas décroché. */
export function estSansReponseDuSecretariat(stats: any): boolean {
  return !!stats && stats.end_reason === "end_bridge_not_responsed";
}

/**
 * Détermine si un appel doit être compté comme un "vrai" transfert vers
 * secrétariat. Règle : `estUnTransfert` ET le transferReason n'est pas dans la
 * catégorie `non_transfert`.
 */
export function isCounterTransfer(stats: any): boolean {
  if (!estUnTransfert(stats)) return false;
  const meta = getTransferMeta(stats.transferReason);
  return meta.category !== "non_transfert";
}

/**
 * Un patient qui appelait pour ses résultats ou son compte rendu, passé au
 * secrétariat. LyraeTalk pose `result` par l'intention `demande_resultats`
 * (getIntent.js), depuis une question d'examen (v2/intention.js) et par
 * expression à tout moment (v2/demandesHorsRdv.js).
 */
export function estDemandeDeResultats(stats: any): boolean {
  return isCounterTransfer(stats) && stats.transferReason === "result";
}

/**
 * Un appel arrêté par l'examen lui-même (type fermé au robot, examen non pratiqué,
 * interventionnel, multiple…). Une seule règle pour l'écran client, la tuile admin
 * « Non traités » et le filtre `status=not_performed` : avant le 06/10/2026, l'admin ne
 * comptait que `exam_type` et le client toute la catégorie.
 */
export function estExamenNonPris(stats: any): boolean {
  if (!stats) return false;
  if (stats.exam_not_bookable === true) return true;
  const reason = stats.transferReason;
  return !!reason && getTransferMeta(reason).category === "examen_non_traitable";
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

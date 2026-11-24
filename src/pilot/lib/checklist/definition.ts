import type { CrmCleEtape, CrmModeCochage } from "@prisma/client";

/**
 * Le référentiel de la check-list d'intégration, repris ligne à ligne du dossier
 * produit (« Lyrae Desk et Lyrae Pilot », 19/10/2026, page 13), complété par la
 * checklist de déploiement Talk / Konnect du 06/11/2026 (lot V, CHOIX.md, C-85).
 *
 * Il vit dans le code et non en base : faire évoluer le référentiel ne doit pas
 * demander une migration. Les lignes déjà cochées en base restent valables, elles
 * sont retrouvées par leur clé.
 *
 * Règle non négociable du dossier : « Une étape automatique ne peut pas être
 * cochée à la main, pour qu'il n'y ait jamais deux vérités. » Elle est appliquée
 * côté serveur, dans src/lib/checklist/cocher.ts.
 * INTERFACAGE_TELEPHONIQUE est mixte : le contrôle du numéro pose ou efface
 * seulement le motif. Les essais se déclarent à la main, même si le compte
 * Dashboard disparaît. Seul ce volet manuel change la case et sa date.
 */

/** Les noms de produits tels que le Dashboard les porte dans la table Product. */
export const PRODUIT_TALK = "LyraeTalk";
export const PRODUIT_KONNECT = "LyraeKonnect"; // Product.name, comme src/lib/produits.ts (corrigé le 24/11/2026 : « Konnect » n'existait pas en base)
export const PRODUIT_DESK = "Desk";
/** Anti-absence : rappels avant le RDV, confirmation ou annulation par le patient (C-56). */
export const PRODUIT_NOSHOW = "NoShow";

export type NomProduit =
  | typeof PRODUIT_TALK
  | typeof PRODUIT_KONNECT
  | typeof PRODUIT_DESK
  | typeof PRODUIT_NOSHOW;

export const TOUS_PRODUITS: NomProduit[] = [
  PRODUIT_TALK,
  PRODUIT_KONNECT,
  PRODUIT_DESK,
  PRODUIT_NOSHOW,
];

/** Les produits qui prennent des rendez-vous ou des appels : NoShow n'en fait pas partie. */
const PRODUITS_RDV: NomProduit[] = [PRODUIT_TALK, PRODUIT_KONNECT, PRODUIT_DESK];

/** Les six phases de la checklist de déploiement du 06/11/2026, dans l'ordre (C-85). */
export const PHASES = ["PASSATION", "CADRAGE", "TECHNIQUE", "PARAMETRAGE", "GO_NO_GO", "SUIVI"] as const;
export type Phase = (typeof PHASES)[number];
export const LIBELLES_PHASES: Record<Phase, string> = {
  PASSATION: "Passation",
  CADRAGE: "Cadrage",
  TECHNIQUE: "Mise en place technique",
  PARAMETRAGE: "Paramétrage et formation",
  GO_NO_GO: "Go / no-go et démarrage",
  SUIVI: "Suivi",
};

export type DefinitionEtape = {
  cle: CrmCleEtape;
  libelle: string;
  /** Le libellé pour Konnect, quand celui de Talk n'a pas de sens en ligne (C-85). */
  libelleKonnect?: string;
  phase: Phase;
  mode: CrmModeCochage;
  produits: NomProduit[];
  /** D'où vient la réponse, affiché tel quel dans l'écran Intégrations. */
  source: string;
  /** Durée attendue en jours. Dépassée, l'étape déclenche une alerte. */
  dureeAttendueJours: number;
  /**
   * D'où part la durée attendue. OUVERTURE : la création de la case, au
   * rattachement. MISE_EN_SERVICE : le jour de la mise en service ; avant, la
   * case attend et ne se coche pas (C-85).
   */
  depart: "OUVERTURE" | "MISE_EN_SERVICE";
  /** Une étape bloquante empêche un passage en production honnête. */
  bloquante: boolean;
  /**
   * Ajoutée par le lot V (C-85). Un déploiement déjà en service ne la reçoit
   * pas : elle n'arrive que chez ceux qui démarrent, et le suivi chez ceux mis
   * en service depuis moins de 30 jours.
   */
  lotV?: true;
};

type Saisie = Omit<DefinitionEtape, "depart"> & { depart?: DefinitionEtape["depart"] };

const SAISIE: Saisie[] = [
  // --- Passation ------------------------------------------------------------
  {
    cle: "PASSATION",
    libelle: "Mail de passation reçu",
    phase: "PASSATION",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, mail du commercial : contacts, promesses faites, RIS, opérateur ou site web, date souhaitée",
    dureeAttendueJours: 3,
    bloquante: false,
    lotV: true,
  },
  {
    cle: "PRECADRAGE_INTERNE",
    libelle: "Pré-cadrage interne fait",
    phase: "PASSATION",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, 30 minutes entre commercial, déploiement et technique",
    dureeAttendueJours: 7,
    bloquante: false,
    lotV: true,
  },
  // --- Cadrage --------------------------------------------------------------
  {
    cle: "PREMIERE_VISIO",
    libelle: "Première visio avec le client",
    phase: "CADRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, rendez-vous commercial",
    dureeAttendueJours: 14,
    bloquante: false,
  },
  {
    cle: "PARCOURS_PATIENT",
    libelle: "Parcours patient validé par le client",
    phase: "CADRAGE",
    mode: "MANUEL",
    produits: PRODUITS_RDV,
    source: "Pilot, parcours et stratégie de prise de rendez-vous validés en visio",
    dureeAttendueJours: 14,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "CONTACTS_FACTURATION",
    libelle: "Contacts facturation récupérés",
    phase: "CADRAGE",
    mode: "AUTOMATIQUE",
    produits: TOUS_PRODUITS,
    source: "Pilot, contacts du compte marqués « facturation »",
    dureeAttendueJours: 14,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "RESPONSABLE_DESIGNE",
    libelle: "Responsable du déploiement désigné",
    phase: "CADRAGE",
    mode: "AUTOMATIQUE",
    produits: TOUS_PRODUITS,
    source: "Pilot, chef de projet de la fiche du compte",
    dureeAttendueJours: 7,
    bloquante: false,
    lotV: true,
  },
  {
    cle: "LISTE_ELEMENTS",
    libelle: "Liste des éléments à fournir envoyée au client",
    phase: "CADRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, la date limite se note en échéance d'une attente du client",
    dureeAttendueJours: 7,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "VISIO_TECHNIQUE",
    libelle: "Visio technique : accès au RIS, agenda, opérateur téléphonique",
    phase: "CADRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot",
    dureeAttendueJours: 14,
    bloquante: true,
  },
  // C-93 : commande à l'éditeur, distincte du bon de commande du client (C-85).
  { cle: "BON_COMMANDE_EDL", libelle: "Bon de commande EDL reçu", phase: "CADRAGE", mode: "MANUEL", produits: TOUS_PRODUITS,
    source: "Pilot, réception de la commande passée à EDL pour Xplore. Attente possible auprès d'EDL.", dureeAttendueJours: 14, bloquante: false, lotV: true },
  // --- Mise en place technique ---------------------------------------------
  {
    cle: "JETON_XPLORE",
    libelle: "Jeton d'accès Xplore reçu d'EDL et testé",
    libelleKonnect: "Jeton d'accès au RIS reçu de l'éditeur et testé",
    phase: "TECHNIQUE",
    mode: "AUTOMATIQUE",
    produits: TOUS_PRODUITS,
    source: "Configuration d'AI2Xplore, sonde",
    dureeAttendueJours: 21,
    bloquante: true,
  },
  {
    cle: "CODE_CENTRE",
    libelle: "Centre relié à son compte Dashboard",
    phase: "TECHNIQUE",
    mode: "AUTOMATIQUE",
    produits: TOUS_PRODUITS,
    source: "ExternalCenterMapping, KonnectTenantMapping",
    dureeAttendueJours: 7,
    bloquante: true,
  },
  {
    cle: "MAPPING_EXAMENS",
    libelle: "Examens associés entre Xplore et Lyrae",
    libelleKonnect: "Examens associés entre l'agenda et Konnect",
    phase: "TECHNIQUE",
    mode: "AUTOMATIQUE",
    produits: TOUS_PRODUITS,
    source: "ExamMapping, registre de complétude",
    dureeAttendueJours: 30,
    bloquante: true,
  },
  {
    // Retour client du 05/11/2026 (CHOIX.md, C-52) : un Xplore mal paramétré fait
    // voir au robot un planning complet qui ne l'est pas. Aucune sonde ne le
    // détecte : on le constate par un essai de prise de rendez-vous.
    cle: "TEST_CRENEAUX",
    libelle: "Créneaux testés : le robot voit le vrai planning",
    libelleKonnect: "Créneaux en ligne testés : Konnect voit le vrai planning",
    phase: "TECHNIQUE",
    mode: "MANUEL",
    produits: PRODUITS_RDV,
    source: "Pilot, essai de prise de RDV",
    dureeAttendueJours: 7,
    bloquante: true,
  },
  {
    // Numéro constaté automatiquement ; essais cochés uniquement à la main.
    cle: "INTERFACAGE_TELEPHONIQUE",
    libelle: "Ligne téléphonique branchée et testée",
    phase: "TECHNIQUE",
    mode: "MIXTE",
    produits: [PRODUIT_TALK, PRODUIT_DESK],
    source: "UserNumber, heartbeat",
    dureeAttendueJours: 21,
    bloquante: true,
  },
  {
    cle: "INTEGRATION_SITE_WEB",
    libelle: "Prise de rendez-vous ajoutée au site web",
    phase: "TECHNIQUE",
    mode: "MANUEL",
    produits: [PRODUIT_KONNECT],
    source: "Pilot",
    dureeAttendueJours: 21,
    bloquante: true,
  },
  // --- Paramétrage et formation --------------------------------------------
  {
    // Retour client du 05/11/2026 (C-52) : le Dashboard arrivait trop tard. Il
    // part tôt, sur un site fictif, pour que le client s'entraîne.
    cle: "ACCES_DASHBOARD_ENTRAINEMENT",
    libelle: "Accès au Dashboard d'entraînement envoyé",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, avec des accès administrateur et lecture seule",
    dureeAttendueJours: 7,
    bloquante: false,
  },
  {
    // Retour client du 05/11/2026 (C-52) : le paramétrage est difficile sans
    // formation. Distincte de la formation des secrétaires, qui vient à la fin.
    cle: "FORMATION_DASHBOARD",
    libelle: "Client formé au paramétrage du Dashboard",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, avec la liste des présents",
    dureeAttendueJours: 14,
    bloquante: true,
  },
  {
    cle: "REGLAGES_ROBOT",
    libelle: "Robot paramétré : consignes, FAQ, questions",
    phase: "PARAMETRAGE",
    mode: "AUTOMATIQUE",
    produits: [PRODUIT_TALK],
    source: "REGISTRE_TALK",
    // 21 jours au départ ; le terrain parle d'un mois de paramétrage (C-52).
    dureeAttendueJours: 30,
    bloquante: true,
  },
  {
    cle: "REGLES_EXAMENS",
    libelle: "Règles par examen : préparation, contre-indications, ordonnance obligatoire",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: [PRODUIT_KONNECT],
    source: "Pilot, en attendant une source au Dashboard",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "LECTURE_ORDONNANCE",
    libelle: "Lecture d'ordonnance testée sur des ordonnances du centre",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: [PRODUIT_KONNECT],
    source: "Pilot, essai sur des ordonnances locales",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "MESSAGES_PATIENTS",
    libelle: "Messages patients paramétrés : confirmation, rappels SMS et mail",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: [PRODUIT_TALK, PRODUIT_KONNECT],
    source: "Pilot",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  {
    // NoShow (C-56) : le centre valide le texte des rappels avant le premier envoi.
    cle: "MESSAGES_RAPPEL",
    libelle: "Messages de rappel validés par le centre",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: [PRODUIT_NOSHOW],
    source: "Pilot, validation écrite du centre",
    dureeAttendueJours: 14,
    bloquante: true,
  },
  {
    cle: "FORMATION_SECRETAIRES",
    libelle: "Secrétaires formées",
    libelleKonnect: "Secrétaires formées au Dashboard",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    // Konnect ajouté par le lot V (C-85) : la checklist forme aussi ses secrétaires.
    produits: [PRODUIT_TALK, PRODUIT_KONNECT, PRODUIT_DESK],
    source: "Pilot, avec la liste des présents",
    dureeAttendueJours: 14,
    bloquante: true,
  },
  {
    cle: "FORMATION_CONFIRMEE",
    libelle: "Formation confirmée par le client",
    phase: "PARAMETRAGE",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, fiche de formation remplie",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  // --- Go / no-go et démarrage ---------------------------------------------
  {
    cle: "DATE_DEMARRAGE_CONFIRMEE",
    libelle: "Date de démarrage confirmée au client",
    phase: "GO_NO_GO",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, mail au client",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "PV_RECETTE",
    libelle: "PV de recette signé par le client",
    phase: "GO_NO_GO",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot",
    dureeAttendueJours: 30,
    bloquante: true,
    lotV: true,
  },
  {
    cle: "PASSAGE_PRODUCTION",
    libelle: "Mise en service déclarée",
    phase: "GO_NO_GO",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "CentreStatut",
    dureeAttendueJours: 7,
    bloquante: false,
  },
  {
    cle: "PREMIER_APPEL_REEL",
    libelle: "Premier vrai appel, premier rendez-vous pris",
    libelleKonnect: "Premier rendez-vous pris en ligne via ordonnance",
    phase: "GO_NO_GO",
    mode: "AUTOMATIQUE",
    produits: PRODUITS_RDV,
    source: "Call, remontée Konnect",
    dureeAttendueJours: 7,
    bloquante: false,
  },
  {
    // À cocher en attendant une source automatique des envois NoShow.
    cle: "PREMIER_RAPPEL",
    libelle: "Premier rappel envoyé, première réponse reçue",
    phase: "GO_NO_GO",
    mode: "MANUEL",
    produits: [PRODUIT_NOSHOW],
    source: "Pilot, en attendant le journal des envois",
    dureeAttendueJours: 7,
    bloquante: false,
  },
  {
    cle: "TOP_FACTURATION",
    libelle: "Top départ envoyé à la facturation",
    phase: "GO_NO_GO",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, avec le PV et la date de mise en service",
    dureeAttendueJours: 2,
    depart: "MISE_EN_SERVICE",
    bloquante: false,
    lotV: true,
  },
  // --- Suivi ----------------------------------------------------------------
  {
    cle: "SUIVI_J1",
    libelle: "J+1 : point avec le secrétariat, corrections urgentes",
    phase: "SUIVI",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot",
    dureeAttendueJours: 1,
    depart: "MISE_EN_SERVICE",
    bloquante: false,
    lotV: true,
  },
  {
    cle: "SUIVI_S1",
    libelle: "S+1 : point client, réglages ajustés",
    phase: "SUIVI",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot",
    dureeAttendueJours: 7,
    depart: "MISE_EN_SERVICE",
    bloquante: false,
    lotV: true,
  },
  {
    cle: "BILAN_M1",
    libelle: "M+1 : bilan du premier mois",
    phase: "SUIVI",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot, chiffres du Dashboard notés en commentaire",
    dureeAttendueJours: 30,
    depart: "MISE_EN_SERVICE",
    bloquante: false,
    lotV: true,
  },
  {
    cle: "ESSAI_VALIDE",
    libelle: "M+1 : essai du contrat signé validé par le client",
    phase: "SUIVI",
    mode: "MANUEL",
    produits: TOUS_PRODUITS,
    source: "Pilot",
    dureeAttendueJours: 30,
    depart: "MISE_EN_SERVICE",
    bloquante: false,
    lotV: true,
  },
];

/** Le référentiel complet, rangé par phase. L'ordre sert à l'affichage et aux départages. */
export const CHECKLIST: DefinitionEtape[] = SAISIE.map((e) => ({ ...e, depart: e.depart ?? "OUVERTURE" }));

/** Le libellé de Konnect remplace celui de Talk quand il existe. */
function pourProduit(def: DefinitionEtape, nomProduit?: string | null): DefinitionEtape {
  return nomProduit === PRODUIT_KONNECT && def.libelleKonnect ? { ...def, libelle: def.libelleKonnect } : def;
}

/** Les étapes applicables à un produit, dans l'ordre des phases. */
export function etapesDuProduit(nomProduit: string): DefinitionEtape[] {
  return CHECKLIST.filter((e) =>
    (e.produits as string[]).includes(nomProduit),
  ).map((e) => pourProduit(e, nomProduit));
}

/**
 * Les étapes à montrer et à compter pour un rattachement : celles du produit,
 * moins les étapes du lot V que l'évaluateur n'a pas créées parce que le
 * déploiement était déjà en service (C-85). `existe` dit si la case est en base.
 */
export function etapesSuivies(nomProduit: string, existe: (cle: CrmCleEtape) => boolean): DefinitionEtape[] {
  return etapesDuProduit(nomProduit).filter((e) => !e.lotV || existe(e.cle));
}

export function definitionEtape(cle: CrmCleEtape, nomProduit?: string | null): DefinitionEtape {
  const trouvee = CHECKLIST.find((e) => e.cle === cle);
  if (!trouvee) {
    throw new Error(`Étape de check-list inconnue : ${cle}`);
  }
  return pourProduit(trouvee, nomProduit);
}

/** Une étape automatique n'est jamais cochée par un humain. */
export function cochableALaMain(cle: CrmCleEtape): boolean {
  return definitionEtape(cle).mode !== "AUTOMATIQUE";
}

/** Rang de la phase : l'étape de go/no-go regarde tout ce qui la précède. */
export const rangPhase = (phase: Phase) => PHASES.indexOf(phase);

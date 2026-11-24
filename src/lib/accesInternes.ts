/**
 * Ce qu'un compte interne (rôle ADMIN) ouvre au Dashboard, page par page.
 * -----------------------------------------------------------------------------
 * Demande d'Enzo du 24/11/2026 (plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md,
 * « Cloisons ») : le super-administrateur crée les comptes de l'équipe dans Pilot et
 * coche, compte par compte, les écrans du Dashboard qu'ils ouvrent. Pilot seul, Pilot
 * et les espaces des clients, Pilot et quelques écrans d'administration : tout se
 * coche.
 *
 * Où c'est rangé : dans `User.permissions`, le même JSON que les sous-comptes des
 * clients (`src/lib/permissions.ts`), avec en plus les clés des écrans
 * d'administration (`admin_*`). Il est déjà dans la session et relu en base à chaque
 * rafraîchissement : rien à ajouter à la connexion.
 *
 * Les règles :
 *   - SUPER_ADMIN : tout, toujours. Ce fichier ne le concerne pas.
 *   - ADMIN : **refus par défaut**. Sans rien de coché (`permissions` vide ou null),
 *     le compte n'ouvre que Pilot. Une page cochée « lecture » s'ouvre ; « quotidien »
 *     permet en plus les gestes du quotidien de cette page (appel traité, ordonnance
 *     rangée, patient rappelé). La configuration reste au seul super-administrateur,
 *     quoi qu'on coche (`ecritureRefuseeAuxAdmin` de `src/lib/espaces.ts`).
 *   - Le serveur applique ces droits dans le middleware, pages ET routes d'API
 *     (`CARTE_API` plus bas) : masquer un menu ne suffirait pas.
 *
 * Module sans dépendance serveur : le middleware (Edge) et les composants l'importent.
 */
import { PAGE_GROUPS, PAGE_LABELS, PAGES, type AccessLevel, type PageKey } from "./permissions";

/** Les écrans d'administration qu'on peut ouvrir à un compte interne. */
export const PAGES_ADMIN = {
  VUE_ENSEMBLE: "admin_vue_ensemble",
  STATS_PRODUIT: "admin_stats_produit",
  KONNECT_OCR: "admin_konnect_ocr",
  ACTIONS: "admin_actions",
  MISE_EN_SERVICE: "admin_mise_en_service",
  COMPTES: "admin_comptes",
  CONFIG_ROBOT: "admin_config_robot",
  IDENTIFIANTS_EXTERNES: "admin_identifiants_externes",
} as const;

export type CleAdmin = (typeof PAGES_ADMIN)[keyof typeof PAGES_ADMIN];
export type CleAcces = PageKey | CleAdmin;
export type AccesInternes = Partial<Record<CleAcces, AccessLevel>>;

export const LIBELLES_ADMIN: Record<CleAdmin, { libelle: string; detail: string }> = {
  admin_vue_ensemble: { libelle: "Vue d'ensemble", detail: "L'accueil de l'administration : activité de tous les centres." },
  admin_stats_produit: { libelle: "Statistiques produit", detail: "Les statistiques internes du robot." },
  admin_konnect_ocr: { libelle: "OCR de Konnect", detail: "La lecture des ordonnances, champ par champ." },
  admin_actions: { libelle: "Actions", detail: "La page de liens vers les outils d'administration." },
  admin_mise_en_service: {
    libelle: "Mise en service",
    detail: "Nouveau centre, nouveau portail Konnect, installations Talk et Konnect, pack de configuration. En lecture : seul le super-administrateur les remplit.",
  },
  admin_comptes: { libelle: "Clients et comptes", detail: "La liste des clients et de leurs comptes." },
  admin_config_robot: { libelle: "Configuration du robot", detail: "Les réglages du robot par centre, en lecture." },
  admin_identifiants_externes: { libelle: "Identifiants externes", detail: "Les correspondances avec les logiciels des centres, en lecture." },
};

/** Les adresses de chaque écran d'administration. */
const CHEMINS_ADMIN: Array<{ motif: RegExp; cle: CleAdmin }> = [
  { motif: /^\/admin\/overview(?:\/|$)/, cle: PAGES_ADMIN.VUE_ENSEMBLE },
  { motif: /^\/admin\/analytics-internal(?:\/|$)/, cle: PAGES_ADMIN.STATS_PRODUIT },
  { motif: /^\/admin\/konnect-ocr(?:\/|$)/, cle: PAGES_ADMIN.KONNECT_OCR },
  { motif: /^\/admin\/actions(?:\/|$)/, cle: PAGES_ADMIN.ACTIONS },
  {
    motif: /^\/admin\/(?:nouveau-centre|nouveau-centre-konnect|pack|create-client|talk-installation|konnect-installation)(?:\/|$)/,
    cle: PAGES_ADMIN.MISE_EN_SERVICE,
  },
  { motif: /^\/admin\/(?:comptes|clients|manage-clients|users|reports)(?:\/|$)/, cle: PAGES_ADMIN.COMPTES },
  { motif: /^\/admin\/talk-config(?:\/|$)/, cle: PAGES_ADMIN.CONFIG_ROBOT },
  { motif: /^\/admin\/external-mapping(?:\/|$)/, cle: PAGES_ADMIN.IDENTIFIANTS_EXTERNES },
];

/** La clé de l'écran d'administration d'une adresse, ou null (écran que seul le super-administrateur ouvre). */
export function cleAdminDuChemin(chemin: string): CleAdmin | null {
  for (const { motif, cle } of CHEMINS_ADMIN) if (motif.test(chemin)) return cle;
  return null;
}

/** Les groupes de l'écran Équipe de Pilot, dans l'ordre où on les coche. */
export const GROUPES_ACCES: Array<{ titre: string; detail: string; cles: CleAcces[]; quotidien: boolean }> = [
  {
    titre: "Administration",
    detail: "Les écrans d'administration du Dashboard. Toujours en lecture : seul le super-administrateur modifie.",
    cles: Object.values(PAGES_ADMIN),
    quotidien: false,
  },
  ...PAGE_GROUPS.map((g) => ({
    titre: g.titre === "Transverse" ? "Support" : `Espaces des clients : ${g.titre}`,
    detail:
      g.titre === "Transverse"
        ? "La console des tickets des centres."
        : "Les écrans d'un centre, ouverts depuis le choix du centre en haut de page.",
    cles: g.pages as CleAcces[],
    quotidien: true,
  })),
];

export function libelleAcces(cle: CleAcces): string {
  return cle in LIBELLES_ADMIN ? LIBELLES_ADMIN[cle as CleAdmin].libelle : PAGE_LABELS[cle as PageKey];
}

const TOUTES_LES_CLES: CleAcces[] = GROUPES_ACCES.flatMap((g) => g.cles);
const CLES_ADMIN = new Set<string>(Object.values(PAGES_ADMIN));

/**
 * Les pages où « quotidien » a un sens : on y traite le travail du jour sans toucher à
 * la configuration. Ailleurs, seul « lecture » se coche.
 */
export const PAGES_DU_QUOTIDIEN: ReadonlySet<CleAcces> = new Set<CleAcces>([
  PAGES.CALLS,
  PAGES.INCIDENTS,
  PAGES.ORDONNANCES,
  PAGES.KONNECT_DEMANDES_RAPPEL,
  PAGES.KONNECT_FILE_ATTENTE,
  PAGES.KONNECT_QUESTIONNAIRES,
  PAGES.TICKETS,
]);

/** Lit le JSON en base (ou de la session) ; tout ce qui n'est pas une clé connue est ignoré. */
export function lireAccesInternes(brut: unknown): AccesInternes {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return {};
  const out: AccesInternes = {};
  for (const [cle, niveau] of Object.entries(brut as Record<string, unknown>)) {
    if (!TOUTES_LES_CLES.includes(cle as CleAcces)) continue;
    if (niveau === "read") out[cle as CleAcces] = "read";
    else if (niveau === "write") out[cle as CleAcces] = PAGES_DU_QUOTIDIEN.has(cle as CleAcces) ? "write" : "read";
  }
  return out;
}

/** Ce qu'on écrit en base : seulement les pages ouvertes, dans l'ordre de l'écran. */
export function normaliserAccesInternes(brut: unknown): AccesInternes {
  const lus = lireAccesInternes(brut);
  const out: AccesInternes = {};
  for (const cle of TOUTES_LES_CLES) if (lus[cle]) out[cle] = lus[cle];
  return out;
}

export function niveauInterne(acces: AccesInternes, cle: CleAcces): AccessLevel {
  return acces[cle] ?? "none";
}

/** Vrai si le compte ouvre au moins un écran du Dashboard (sinon, il n'a que Pilot). */
export function ouvreLeDashboard(acces: AccesInternes): boolean {
  return Object.values(acces).some((n) => n === "read" || n === "write");
}

/** Vrai si le compte ouvre au moins un écran d'un centre (il lui faut alors le choix du centre). */
export function ouvreLesCentres(acces: AccesInternes): boolean {
  return Object.entries(acces).some(([cle, n]) => !CLES_ADMIN.has(cle) && cle !== PAGES.TICKETS && n !== "none");
}

/** Les préréglages de l'écran Équipe : un point de départ, que l'on affine ensuite. */
export const PREREGLAGES: Array<{ cle: string; libelle: string; detail: string; acces: () => AccesInternes }> = [
  { cle: "pilot", libelle: "Pilot seul", detail: "Aucun écran du Dashboard.", acces: () => ({}) },
  {
    cle: "centres",
    libelle: "Pilot et les espaces des clients",
    detail: "Tous les écrans des centres, en lecture, sans l'administration.",
    acces: () => Object.fromEntries(PAGE_GROUPS.flatMap((g) => g.pages).map((p) => [p, "read"])) as AccesInternes,
  },
  {
    cle: "quotidien",
    libelle: "Pilot et le suivi des centres",
    detail: "Les écrans des centres, et le traitement du quotidien (appels, ordonnances, rappels, support).",
    acces: () =>
      Object.fromEntries(
        PAGE_GROUPS.flatMap((g) => g.pages).map((p) => [p, PAGES_DU_QUOTIDIEN.has(p) ? "write" : "read"])
      ) as AccesInternes,
  },
  {
    cle: "tout",
    libelle: "Tout le Dashboard en lecture",
    detail: "Administration et espaces des clients, sans rien pouvoir modifier.",
    acces: () => Object.fromEntries(TOUTES_LES_CLES.map((c) => [c, "read"])) as AccesInternes,
  },
];

/**
 * `centres+admin_vue_ensemble` → les écrans ouverts, en lecture. Chaque morceau est un
 * préréglage ou la clé d'un écran ; le texte du refus si l'un est inconnu. Lu par
 * `scripts/pilot/creer-comptes-internes.ts` (colonne `dashboard`).
 */
export function accesDepuisTexte(texte: string): AccesInternes | string {
  const acces: Record<string, string> = {};
  for (const morceau of texte.split("+").map((m) => m.trim()).filter(Boolean)) {
    const preregle = PREREGLAGES.find((p) => p.cle === morceau.toLowerCase());
    if (preregle) { Object.assign(acces, preregle.acces()); continue; }
    if (!TOUTES_LES_CLES.includes(morceau as CleAcces)) return `écran inconnu : « ${morceau} »`;
    acces[morceau] = acces[morceau] ?? "read";
  }
  return normaliserAccesInternes(acces);
}

/** L'adresse d'arrivée de chaque écran d'administration, dans l'ordre où on y entre. */
export const ADRESSES_ADMIN: Array<[CleAdmin, string]> = [
  [PAGES_ADMIN.VUE_ENSEMBLE, "/admin/overview"],
  [PAGES_ADMIN.ACTIONS, "/admin/actions"],
  [PAGES_ADMIN.COMPTES, "/admin/comptes"],
  [PAGES_ADMIN.STATS_PRODUIT, "/admin/analytics-internal"],
  [PAGES_ADMIN.KONNECT_OCR, "/admin/konnect-ocr"],
  [PAGES_ADMIN.CONFIG_ROBOT, "/admin/talk-config"],
  [PAGES_ADMIN.IDENTIFIANTS_EXTERNES, "/admin/external-mapping"],
  [PAGES_ADMIN.MISE_EN_SERVICE, "/admin/nouveau-centre"],
];

/** Le premier écran d'administration ouvert à ce compte, ou null s'il n'en a aucun. */
export function premierEcranAdmin(acces: AccesInternes): string | null {
  for (const [cle, adresse] of ADRESSES_ADMIN) if (niveauInterne(acces, cle) !== "none") return adresse;
  if (niveauInterne(acces, PAGES.TICKETS) !== "none") return "/admin/ticket";
  return null;
}

/** Posé par le middleware sur chaque page `/admin` : la seconde garde (`src/app/admin/layout.tsx`) le lit. */
export const ENTETE_CHEMIN_ADMIN = "x-lyrae-chemin-admin";

export const MESSAGE_ACCES_INTERNE =
  "Votre compte n'a pas accès à cet écran du Dashboard. Le super-administrateur peut vous l'ouvrir dans l'écran Équipe de Pilot.";

/**
 * Ce qu'une route d'API demande pour servir un compte interne :
 *   - `toujours` : sans rapport avec un écran (connexion, cloche, son mot de passe) ;
 *   - `commun`   : montée partout dans le Dashboard (menu, en-tête, choix du centre),
 *                  permise dès que le compte ouvre au moins un écran ;
 *   - `centres`  : le choix du centre et ce qui l'entoure, permis dès qu'il ouvre un
 *                  écran d'un centre ;
 *   - une liste de clés : permise si l'une d'elles est ouverte.
 * Une route absente de la carte est REFUSÉE à un compte interne : c'est voulu. Le
 * contrôle `scripts/pilot/controle-acces-api.mjs` exige que chaque route y soit.
 */
export type BesoinRoute = "toujours" | "commun" | "centres" | "aucun" | CleAcces[];

/** Rempli plus bas : motif de l'adresse, puis ce qu'il demande. Le premier qui correspond décide. */
export const CARTE_API: Array<[RegExp, BesoinRoute]> = [
  // Sans rapport avec un écran du Dashboard : la connexion, la cloche, et ce que les écrans de Pilot lisent.
  [/^\/api\/centre-statut\/?$/, "toujours"], // /api/centre-statut
  [/^\/api\/completude\/?$/, "toujours"], // /api/completude
  [/^\/api\/deployments\/?$/, "toujours"], // /api/deployments
  [/^\/api\/notification\/get-unread\/?$/, "toujours"], // /api/notification/get-unread
  [/^\/api\/notification\/mark-all-read\/?$/, "toujours"], // /api/notification/mark-all-read
  [/^\/api\/notification\/mark-read\/?$/, "toujours"], // /api/notification/mark-read
  [/^\/api\/auth\/.+\/?$/, "toujours"], // /api/auth/[...nextauth]
  [/^\/api\/socket\/?$/, "toujours"], // /api/socket (src/pages/api)
  // Montées partout dans le Dashboard : menu, en-tête, choix du centre, recherche, profil.
  [/^\/api\/admin\/centres\/?$/, "commun"], // /api/admin/centres
  [/^\/api\/admin\/produits-du-centre\/?$/, "commun"], // /api/admin/produits-du-centre
  [/^\/api\/centres-lies\/?$/, "commun"], // /api/centres-lies
  [/^\/api\/client\/?$/, "commun"], // /api/client
  [/^\/api\/client\/change-password\/?$/, "commun"], // /api/client/change-password
  [/^\/api\/client\/deconnecter-partout\/?$/, "commun"], // /api/client/deconnecter-partout
  [/^\/api\/client\/profil\/?$/, "commun"], // /api/client/profil
  [/^\/api\/premiers-pas\/?$/, "commun"], // /api/premiers-pas
  [/^\/api\/recherche\/?$/, "commun"], // /api/recherche
  [/^\/api\/recherche\/voix\/?$/, "commun"], // /api/recherche/voix
  [/^\/api\/centre\/[^/]+\/produits\/?$/, "commun"], // /api/centre/[userId]/produits
  [/^\/api\/users\/[^/]+\/products\/?$/, "commun"], // /api/users/[userId]/products
  // Les écrans qui les appellent (relevé du 24/11/2026, graphe des imports écran par écran).
  [/^\/api\/admin\/analytics-internal\/?$/, ["admin_stats_produit"]], // /api/admin/analytics-internal
  [/^\/api\/admin\/clients\/?$/, ["admin_comptes"]], // /api/admin/clients
  [/^\/api\/admin\/clients-comptes\/?$/, ["admin_comptes", "admin_mise_en_service"]], // /api/admin/clients-comptes
  [/^\/api\/admin\/konnect-ocr\/?$/, ["admin_konnect_ocr"]], // /api/admin/konnect-ocr
  [/^\/api\/admin\/pack\/?$/, ["admin_mise_en_service"]], // /api/admin/pack
  [/^\/api\/admin\/reset-password\/?$/, ["admin_comptes"]], // /api/admin/reset-password
  [/^\/api\/admin\/salles\/?$/, ["admin_mise_en_service"]], // /api/admin/salles
  [/^\/api\/admin\/salles\/releve\/?$/, ["admin_mise_en_service"]], // /api/admin/salles/releve
  [/^\/api\/admin\/tickets\/?$/, ["tickets"]], // /api/admin/tickets
  [/^\/api\/calls\/?$/, ["dashboard", "calls", "incidents"]], // /api/calls
  [/^\/api\/configuration\/?$/, ["parametrage", "admin_mise_en_service"]], // /api/configuration
  [/^\/api\/configuration\/exam\/?$/, ["questions_exam"]], // /api/configuration/exam
  [/^\/api\/configuration\/get\/mapping\/?$/, ["parametrage", "mapping_exam"]], // /api/configuration/get/mapping
  [/^\/api\/configuration\/informationnel\/?$/, ["informationnel", "dashboard"]], // /api/configuration/informationnel
  [/^\/api\/configuration\/informationnel\/horaires\/?$/, ["parametrage", "admin_mise_en_service"]], // /api/configuration/informationnel/horaires
  [/^\/api\/configuration\/mapping\/?$/, ["mapping_exam", "admin_mise_en_service"]], // /api/configuration/mapping
  [/^\/api\/configuration\/mapping\/double_exam\/?$/, ["parametrage", "mapping_exam", "admin_mise_en_service"]], // /api/configuration/mapping/double_exam
  [/^\/api\/configuration\/mapping\/test-creneaux\/?$/, ["mapping_exam"]], // /api/configuration/mapping/test-creneaux
  [/^\/api\/configuration\/mapping\/type_exam\/?$/, ["mapping_exam", "calls", "stats_appel"]], // /api/configuration/mapping/type_exam
  [/^\/api\/configuration\/recognize-number\/?$/, ["parametrage"]], // /api/configuration/recognize-number
  [/^\/api\/configuration\/salles\/?$/, ["parametrage", "mapping_exam"]], // /api/configuration/salles
  [/^\/api\/data\/exams\/?$/, ["mapping_exam"]], // /api/data/exams
  [/^\/api\/documents-demandes\/?$/, ["parametrage", "konnect_parametrage"]], // /api/documents-demandes
  [/^\/api\/exam-non-pris\/aggregate\/?$/, ["planning_complet"]], // /api/exam-non-pris/aggregate
  [/^\/api\/external-center-mapping\/?$/, ["admin_identifiants_externes", "admin_mise_en_service"]], // /api/external-center-mapping
  [/^\/api\/konnect-configuration\/?$/, ["konnect_parametrage", "admin_mise_en_service"]], // /api/konnect-configuration
  [/^\/api\/konnect-demandes-rappel\/?$/, ["konnect_demandes_rappel"]], // /api/konnect-demandes-rappel
  [/^\/api\/konnect-examens\/?$/, ["konnect_examens", "konnect_mots", "konnect_entonnoir", "konnect_paires", "konnect_regles_fusion", "admin_mise_en_service"]], // /api/konnect-examens
  [/^\/api\/konnect-file-attente\/ecran\/?$/, ["konnect_file_attente"]], // /api/konnect-file-attente/ecran
  [/^\/api\/konnect-installation\/?$/, ["admin_mise_en_service"]], // /api/konnect-installation
  [/^\/api\/konnect-logo\/?$/, ["konnect_parametrage"]], // /api/konnect-logo
  [/^\/api\/konnect-remontee\/?$/, ["konnect_examens", "konnect_parametrage"]], // /api/konnect-remontee
  [/^\/api\/konnect-sites\/?$/, ["konnect_sites", "konnect_parametrage", "admin_mise_en_service"]], // /api/konnect-sites
  [/^\/api\/konnect-statistiques\/?$/, ["konnect_stats"]], // /api/konnect-statistiques
  [/^\/api\/konnect-stats-jours\/?$/, ["konnect_stats"]], // /api/konnect-stats-jours
  [/^\/api\/konnect-tenant-mapping\/?$/, ["admin_identifiants_externes"]], // /api/konnect-tenant-mapping
  [/^\/api\/module-info\/items\/?$/, ["informationnel", "admin_mise_en_service"]], // /api/module-info/items
  [/^\/api\/planning-complet\/aggregate\/?$/, ["planning_complet"]], // /api/planning-complet/aggregate
  [/^\/api\/prescriptions\/alerts\/?$/, ["ordonnances", "konnect_questionnaires"]], // /api/prescriptions/alerts
  [/^\/api\/prescriptions\/alerts\/count\/?$/, ["ordonnances", "konnect_questionnaires"]], // /api/prescriptions/alerts/count
  [/^\/api\/prescriptions\/config\/?$/, ["parametrage", "konnect_parametrage"]], // /api/prescriptions/config
  [/^\/api\/prescriptions\/par-mail\/?$/, ["ordonnances"]], // /api/prescriptions/par-mail
  [/^\/api\/prescriptions\/questionnaires-stats\/?$/, ["konnect_questionnaires"]], // /api/prescriptions/questionnaires-stats
  [/^\/api\/prescriptions\/rejected\/?$/, ["ordonnances"]], // /api/prescriptions/rejected
  [/^\/api\/prescriptions\/stats\/?$/, ["ordonnances"]], // /api/prescriptions/stats
  [/^\/api\/product-config\/?$/, ["parametrage", "konnect_parametrage", "konnect_mots", "konnect_creneaux", "konnect_entonnoir", "konnect_paires", "konnect_regles_cliniques", "konnect_regles_fusion", "admin_mise_en_service", "admin_config_robot"]], // /api/product-config
  [/^\/api\/products\/?$/, ["admin_mise_en_service", "admin_comptes"]], // /api/products
  [/^\/api\/rdv\/stats\/?$/, ["stats_no_show", "stats_appel", "konnect_relances"]], // /api/rdv/stats
  [/^\/api\/referentiel-examens\/?$/, ["mapping_exam"]], // /api/referentiel-examens
  [/^\/api\/retention-appels\/?$/, ["admin_mise_en_service"]], // /api/retention-appels
  [/^\/api\/sms-confirmation-config\/?$/, ["parametrage", "konnect_parametrage", "stats_no_show", "konnect_relances", "admin_mise_en_service"]], // /api/sms-confirmation-config
  [/^\/api\/stats-appel\/?$/, ["stats_appel", "admin_vue_ensemble"]], // /api/stats-appel
  [/^\/api\/talk-installation\/?$/, ["admin_mise_en_service"]], // /api/talk-installation
  [/^\/api\/talk-medecins\/?$/, ["parametrage"]], // /api/talk-medecins
  [/^\/api\/talk-rdv-en-ligne\/?$/, ["parametrage"]], // /api/talk-rdv-en-ligne
  [/^\/api\/talk-settings\/?$/, ["parametrage"]], // /api/talk-settings
  [/^\/api\/tickets\/?$/, ["tickets"]], // /api/tickets
  [/^\/api\/admin\/clients\/[^/]+\/products\/?$/, ["admin_comptes", "admin_mise_en_service"]], // /api/admin/clients/[id]/products
  [/^\/api\/admin\/number\/[^/]+\/?$/, ["admin_mise_en_service"]], // /api/admin/number/[userId]
  [/^\/api\/calls\/[^/]+\/flag\/?$/, ["calls", "incidents"]], // /api/calls/[id]/flag
  [/^\/api\/calls\/[^/]+\/treated\/?$/, ["calls"]], // /api/calls/[id]/treated
  [/^\/api\/documents-demandes\/[^/]+\/?$/, ["parametrage", "konnect_parametrage"]], // /api/documents-demandes/[id]
  [/^\/api\/documents-demandes\/[^/]+\/modele\/?$/, ["parametrage", "konnect_parametrage"]], // /api/documents-demandes/[id]/modele
  [/^\/api\/module-info\/items\/[^/]+\/?$/, ["informationnel"]], // /api/module-info/items/[id]
  [/^\/api\/prescriptions\/alerts\/[^/]+\/resolve\/?$/, ["ordonnances", "konnect_questionnaires"]], // /api/prescriptions/alerts/[id]/resolve
  [/^\/api\/prescriptions\/alerts\/[^/]+\/suivi\/?$/, ["ordonnances", "konnect_questionnaires"]], // /api/prescriptions/alerts/[id]/suivi
  [/^\/api\/prescriptions\/par-mail\/[^/]+\/ranger\/?$/, ["ordonnances"]], // /api/prescriptions/par-mail/[id]/ranger
  [/^\/api\/prescriptions\/rejected\/[^/]+\/download\/?$/, ["ordonnances"]], // /api/prescriptions/rejected/[id]/download
  [/^\/api\/prescriptions\/rejected\/[^/]+\/resolve\/?$/, ["ordonnances"]], // /api/prescriptions/rejected/[id]/resolve
  [/^\/api\/tickets\/[^/]+\/?$/, ["tickets"]], // /api/tickets/[id]
  [/^\/api\/tickets\/[^/]+\/messages\/?$/, ["tickets"]], // /api/tickets/[id]/messages
  [/^\/api\/tickets\/[^/]+\/status\/?$/, ["tickets"]], // /api/tickets/[id]/status
  // Appelées par une autre brique (clé d'API), par une page patient (jeton), ou réservées au
  // super-administrateur : jamais par un écran ouvert à un compte interne.
  [/^\/api\/admin\/create-client\/?$/, "aucun"], // /api/admin/create-client
  [/^\/api\/admin\/overview\/?$/, "aucun"], // /api/admin/overview
  [/^\/api\/admin\/salles\/cocher-tout\/?$/, "aucun"], // /api/admin/salles/cocher-tout
  [/^\/api\/admin\/users\/?$/, "aucun"], // /api/admin/users
  [/^\/api\/calls\/summary\/?$/, "aucun"], // /api/calls/summary
  [/^\/api\/configuration\/get\/is_open\/?$/, "aucun"], // /api/configuration/get/is_open
  [/^\/api\/configuration\/get\/mapping\/getLibelle\/?$/, "aucun"], // /api/configuration/get/mapping/getLibelle
  [/^\/api\/files\/get-files\/?$/, "aucun"], // /api/files/get-files
  [/^\/api\/files\/uploads\/?$/, "aucun"], // /api/files/uploads
  [/^\/api\/files\/validation\/?$/, "aucun"], // /api/files/validation
  [/^\/api\/incidents-signales\/?$/, "aucun"], // /api/incidents-signales
  [/^\/api\/konnect-file-attente\/?$/, "aucun"], // /api/konnect-file-attente
  [/^\/api\/konnect-file-attente\/transition\/?$/, "aucun"], // /api/konnect-file-attente/transition
  [/^\/api\/konnect-stats-hebdo\/?$/, "aucun"], // /api/konnect-stats-hebdo
  [/^\/api\/konnect-tenant-mapping\/resolve\/?$/, "aucun"], // /api/konnect-tenant-mapping/resolve
  [/^\/api\/konnect-tenants-attendus\/?$/, "aucun"], // /api/konnect-tenants-attendus
  [/^\/api\/prescriptions\/alerts\/open\/?$/, "aucun"], // /api/prescriptions/alerts/open
  [/^\/api\/prescriptions\/alerts\/rdv-deplaces\/?$/, "aucun"], // /api/prescriptions/alerts/rdv-deplaces
  [/^\/api\/prescriptions\/alerts\/rdv-supprimes\/?$/, "aucun"], // /api/prescriptions/alerts/rdv-supprimes
  [/^\/api\/prescriptions\/init\/?$/, "aucun"], // /api/prescriptions/init
  [/^\/api\/prescriptions\/par-mail\/init\/?$/, "aucun"], // /api/prescriptions/par-mail/init
  [/^\/api\/prescriptions\/pending\/?$/, "aucun"], // /api/prescriptions/pending
  [/^\/api\/public\/products\/?$/, "aucun"], // /api/public/products
  [/^\/api\/rdv\/ack\/?$/, "aucun"], // /api/rdv/ack
  [/^\/api\/rdv\/dev-seed\/?$/, "aucun"], // /api/rdv/dev-seed
  [/^\/api\/rdv\/init\/?$/, "aucun"], // /api/rdv/init
  [/^\/api\/rdv\/pending-events\/?$/, "aucun"], // /api/rdv/pending-events
  [/^\/api\/rdv\/reminder-sent\/?$/, "aucun"], // /api/rdv/reminder-sent
  [/^\/api\/rdv\/sante\/?$/, "aucun"], // /api/rdv/sante
  [/^\/api\/admin\/clients\/[^/]+\/?$/, "aucun"], // /api/admin/clients/[id]
  [/^\/api\/admin\/users\/[^/]+\/?$/, "aucun"], // /api/admin/users/[id]
  [/^\/api\/admin\/users\/[^/]+\/kick\/?$/, "aucun"], // /api/admin/users/[id]/kick
  [/^\/api\/module-info\/[^/]+\/?$/, "aucun"], // /api/module-info/[userProductId]
  [/^\/api\/prescriptions\/[^/]+\/status\/?$/, "aucun"], // /api/prescriptions/[token]/status
  [/^\/api\/prescriptions\/[^/]+\/upload\/?$/, "aucun"], // /api/prescriptions/[token]/upload
  [/^\/api\/prescriptions\/ack\/[^/]+\/?$/, "aucun"], // /api/prescriptions/ack/[id]
  [/^\/api\/prescriptions\/download\/[^/]+\/?$/, "aucun"], // /api/prescriptions/download/[id]
  [/^\/api\/rdv\/[^/]+\/?$/, "aucun"], // /api/rdv/[token]
  [/^\/api\/rdv\/[^/]+\/respond\/?$/, "aucun"], // /api/rdv/[token]/respond
  [/^\/api\/users\/[^/]+\/?$/, "aucun"], // /api/users/[userId]
  [/^\/api\/admin\/number\/[^/]+\/[^/]+\/?$/, "aucun"], // /api/admin/number/[userId]/[numberId]
  [/^\/api\/prescriptions\/[^/]+\/formulaire\/[^/]+\/?$/, "aucun"], // /api/prescriptions/[token]/formulaire/[pieceId]
  [/^\/api\/prescriptions\/[^/]+\/formulaire\/[^/]+\/envoyer\/?$/, "aucun"], // /api/prescriptions/[token]/formulaire/[pieceId]/envoyer
  [/^\/api\/prescriptions\/[^/]+\/modele\/[^/]+\/?$/, "aucun"], // /api/prescriptions/[token]/modele/[pieceId]
  [/^\/api\/prescriptions\/[^/]+\/formulaire\/[^/]+\/fond\/[^/]+\/?$/, "aucun"], // /api/prescriptions/[token]/formulaire/[pieceId]/fond/[page]
];

export function besoinDeRoute(chemin: string): BesoinRoute | null {
  for (const [motif, besoin] of CARTE_API) if (motif.test(chemin)) return besoin;
  return null;
}

/** Vrai si un compte interne (ADMIN) avec ces accès peut appeler cette route. */
export function apiPermiseAInterne(chemin: string, acces: AccesInternes): boolean {
  const besoin = besoinDeRoute(chemin);
  if (besoin === null || besoin === "aucun") return false;
  if (besoin === "toujours") return true;
  if (besoin === "commun") return ouvreLeDashboard(acces);
  if (besoin === "centres") return ouvreLesCentres(acces);
  return besoin.some((cle) => niveauInterne(acces, cle) !== "none");
}

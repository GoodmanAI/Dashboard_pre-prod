/**
 * Mapping URL <-> PageKey (chantier 3, Lot B).
 * -----------------------------------------------------------------------------
 * Utilise cote UI :
 *   - SidebarItems : filtre les entrees selon les permissions de l'user
 *   - DashboardLayout : redirect si l'user ouvre une page non autorisee
 * Utilise cote API :
 *   - requirePagePermission() n'utilise PAS ce mapping (chaque endpoint declare
 *     sa page directement). Ce fichier est UI-oriented.
 *
 * Le pattern des URL Talk : `/client/services/talk/[id]/...` — le [id] est
 * ignore dans le matching. Le premier segment apres [id] determine la page.
 */

import { hasPermission, PageKey, PAGES, PermissionSubject } from "./permissions";

/**
 * Ordre : les patterns plus specifiques d'abord (mapping_exam avant
 * parametrage) car on retourne la premiere entree qui matche.
 */
const PATH_MATCHERS: Array<{ pattern: RegExp; page: PageKey }> = [
  // Tickets (client + admin)
  { pattern: /^\/client\/ticket(?:\/|$)/, page: PAGES.TICKETS },
  { pattern: /^\/admin\/ticket(?:\/|$)/, page: PAGES.TICKETS },

  // Talk sous-sections.
  //
  // `(?:\d+\/)?` couvre LES DEUX FORMES D'URL, et ce n'est pas une commodité :
  // `/client/services/talk/23/parametrage` place l'identifiant AVANT la section,
  // `/client/c/8/talk/parametrage` le place avant le produit. Un motif qui ne
  // reconnaîtrait que l'ancienne renverrait `null` sur les nouvelles, et un
  // chemin inconnu LAISSE PASSER (voir `getPageFromPathname`) : les permissions
  // par page cesseraient d'être appliquées sans que rien ne le signale.
  { pattern: /\/talk\/(?:\d+\/)?parametrage\/mapping_exam(?:\/|$)/, page: PAGES.MAPPING_EXAM },
  { pattern: /\/talk\/(?:\d+\/)?parametrage\/questions_exam(?:\/|$)/, page: PAGES.QUESTIONS_EXAM },
  { pattern: /\/talk\/(?:\d+\/)?parametrage(?:\/|$)/, page: PAGES.PARAMETRAGE },
  { pattern: /\/talk\/(?:\d+\/)?informationnel(?:\/|$)/, page: PAGES.INFORMATIONNEL },
  { pattern: /\/talk\/(?:\d+\/)?planning-complet(?:\/|$)/, page: PAGES.PLANNING_COMPLET },
  { pattern: /\/talk\/(?:\d+\/)?ordonnances-manquantes(?:\/|$)/, page: PAGES.ORDONNANCES },
  { pattern: /\/talk\/(?:\d+\/)?incidents(?:\/|$)/, page: PAGES.INCIDENTS },
  { pattern: /\/talk\/(?:\d+\/)?stats-no-show(?:\/|$)/, page: PAGES.STATS_NO_SHOW },
  { pattern: /\/talk\/(?:\d+\/)?stats_appel(?:\/|$)/, page: PAGES.STATS_APPEL },
  { pattern: /\/talk\/(?:\d+\/)?calls(?:\/|$)/, page: PAGES.CALLS },

  // Page racine talk (redirige generalement vers parametrage cote UI)
  { pattern: /\/talk(?:\/\d+)?\/?$/, page: PAGES.DASHBOARD },

  // Konnect sous-sections (ajoutees le 14/09/2026).
  //
  // Les treize ecrans Konnect n'etaient mappes par AUCUN motif, et un chemin inconnu
  // laisse passer (voir `getPageFromPathname` ci-dessous) : le produit entier etait
  // donc hors du modele de droits. Un sous-compte a qui l'on n'avait coche que
  // « Statistiques » voyait tout le menu Konnect et pouvait enregistrer le mapping.
  //
  // Meme `(?:\d+\/)?` que pour Talk, et pour la meme raison : l'ancienne forme
  // `/client/services/konnect/{id}/...` cohabite avec `/client/c/{userId}/konnect/...`.
  { pattern: /\/konnect\/(?:\d+\/)?parametrage(?:\/|$)/, page: PAGES.KONNECT_PARAMETRAGE },
  { pattern: /\/konnect\/(?:\d+\/)?examens(?:\/|$)/, page: PAGES.KONNECT_EXAMENS },
  { pattern: /\/konnect\/(?:\d+\/)?sites(?:\/|$)/, page: PAGES.KONNECT_SITES },
  { pattern: /\/konnect\/(?:\d+\/)?ordre-entonnoir(?:\/|$)/, page: PAGES.KONNECT_ENTONNOIR },
  { pattern: /\/konnect\/(?:\d+\/)?regles-fusion(?:\/|$)/, page: PAGES.KONNECT_REGLES_FUSION },
  {
    pattern: /\/konnect\/(?:\d+\/)?regles-coexistence(?:\/|$)/,
    page: PAGES.KONNECT_REGLES_COEXISTENCE,
  },
  { pattern: /\/konnect\/(?:\d+\/)?ordre-creneaux(?:\/|$)/, page: PAGES.KONNECT_CRENEAUX },
  { pattern: /\/konnect\/(?:\d+\/)?paires-examens(?:\/|$)/, page: PAGES.KONNECT_PAIRES },
  { pattern: /\/konnect\/(?:\d+\/)?mots-cabinet(?:\/|$)/, page: PAGES.KONNECT_MOTS },
  {
    pattern: /\/konnect\/(?:\d+\/)?regles-cliniques(?:\/|$)/,
    page: PAGES.KONNECT_REGLES_CLINIQUES,
  },
  {
    pattern: /\/konnect\/(?:\d+\/)?demandes-rappel(?:\/|$)/,
    page: PAGES.KONNECT_DEMANDES_RAPPEL,
  },
  { pattern: /\/konnect\/(?:\d+\/)?statistiques(?:\/|$)/, page: PAGES.KONNECT_STATS },

  // Page racine konnect, en dernier des motifs Konnect : elle ne doit pas capter
  // les sous-sections ci-dessus.
  { pattern: /\/konnect(?:\/\d+)?\/?$/, page: PAGES.KONNECT_DASHBOARD },

  // Dashboard racine
  { pattern: /^\/client\/?$/, page: PAGES.DASHBOARD },
  { pattern: /^\/admin\/?$/, page: PAGES.DASHBOARD },
];

/**
 * Chemins volontairement HORS du modele de droits par page.
 *
 * Ajoutee le 15/09/2026, avec l'inversion du defaut. Ce n'est pas une liste de
 * commodite : c'est elle qui rend l'inversion possible. Sans elle, refuser un chemin
 * inconnu fermerait la page de connexion, le profil et les pages patient.
 *
 * **Toute entree ici est une decision.** Ajouter un chemin revient a dire « cet ecran
 * n'est regi par aucun droit », ce qui doit rester rare et se justifier en une ligne.
 */
const CHEMINS_EXEMPTS: RegExp[] = [
  /^\/$/, // racine : redirige selon le role, ne rend rien
  /^\/authentication(?:\/|$)/, // connexion
  /^\/c\/[^/]+\/?$/, // lien court patient (SMS)
  /^\/d\/[^/]+\/?$/, // depot d'ordonnance patient
  /^\/confirm\/[^/]+\/?$/, // confirmation patient (forme longue)
  /^\/client\/profile\/?$/, // son propre profil : tout compte y a droit
  /^\/client\/services\/talk-dentist\/?$/, // vitrine produit, aucune donnee client
  /^\/apercu-mapping\/?$/, // page d'apercu, hors session
  /^\/icons\/?$/, // gabarits du theme MUI, livres avec le modele
  /^\/utilities\//,
];

/**
 * Le verdict d'acces pour un chemin.
 *
 * **Trois genres, et pas deux, c'est tout l'enjeu.** Les chemins non declares ne sont
 * pas tous des oublis : les pages d'administration relevent du ROLE et ne doivent
 * jamais entrer dans le modele par page (un compte CLIENT ne doit pas pouvoir se voir
 * cocher « gestion des utilisateurs »), et une poignee d'ecrans utilitaires ne sont
 * regis par aucun droit. Un modele a deux genres fermerait les deux.
 *
 * `inconnu` est le defaut, et il REFUSE. C'est l'inverse du comportement d'avant le
 * 15/09/2026, ou un chemin non reconnu laissait passer : c'est ce defaut ouvrant qui a
 * laisse les treize ecrans Konnect hors du modele pendant des mois, sans que rien ne le
 * signale. Desormais, tout ecran ajoute doit se declarer, sous peine d'etre refuse tout
 * de suite et visiblement.
 */
export type VerdictAcces =
  | { genre: "page"; page: PageKey }
  | { genre: "admin" }
  | { genre: "exempt" }
  | { genre: "inconnu" };

export function verdictAcces(pathname: string): VerdictAcces {
  // Les motifs d'abord : ils couvrent `/admin/ticket` et `/admin`, qui sont de vraies
  // pages du modele et non des ecrans d'administration.
  for (const { pattern, page } of PATH_MATCHERS) {
    if (pattern.test(pathname)) return { genre: "page", page };
  }
  if (/^\/admin(?:\/|$)/.test(pathname)) return { genre: "admin" };
  for (const motif of CHEMINS_EXEMPTS) {
    if (motif.test(pathname)) return { genre: "exempt" };
  }
  return { genre: "inconnu" };
}

/** Meme verdict, pour un href de menu qui peut porter `{USER_ID}` non resolu. */
export function verdictAccesHref(href: string): VerdictAcces {
  return verdictAcces(href.replace("{USER_ID}", "0"));
}

/**
 * Deduit la PageKey d'un pathname. Retourne null si le pathname ne correspond
 * a aucune page connue.
 *
 * ⚠️ **Ne pas s'en servir pour decider d'un acces.** Elle confond « page
 * d'administration », « ecran exempte » et « chemin inconnu » sous un meme `null`, ce
 * qui etait precisement le defaut corrige le 15/09/2026. Utiliser `verdictAcces`.
 * Conservee parce qu'elle reste juste pour repondre a « quelle page est-ce ? ».
 */
export function getPageFromPathname(pathname: string): PageKey | null {
  const verdict = verdictAcces(pathname);
  return verdict.genre === "page" ? verdict.page : null;
}

/**
 * Deduit la PageKey d'un href sidebar (peut contenir {USER_ID} non resolu).
 * Meme logique que getPageFromPathname mais tolere les placeholders.
 */
export function getPageFromHref(href: string): PageKey | null {
  // Remplace {USER_ID} par un id fictif pour matcher les regex
  return getPageFromPathname(href.replace("{USER_ID}", "0"));
}

/**
 * Ordre prioritaire des pages pour choisir une page d'arrivee / fallback
 * quand plusieurs pages sont accessibles. On prend la premiere dans cet
 * ordre qui matche les permissions du user.
 *
 * Logique : DASHBOARD en premier (la vraie home) puis les pages a forte
 * valeur metier (ordonnances, tickets), puis les stats, puis la config.
 */
export const PAGE_PRIORITY: PageKey[] = [
  PAGES.DASHBOARD,
  PAGES.ORDONNANCES,
  PAGES.TICKETS,
  PAGES.STATS_APPEL,
  PAGES.CALLS,
  PAGES.STATS_NO_SHOW,
  PAGES.PLANNING_COMPLET,
  PAGES.INCIDENTS,
  PAGES.INFORMATIONNEL,
  PAGES.PARAMETRAGE,
  PAGES.MAPPING_EXAM,
  PAGES.QUESTIONS_EXAM,
  PAGES.STATS,

  // Konnect en fin de liste (14/09/2026) : Talk reste la porte d'entree par defaut
  // d'un client qui porte les deux produits. Mais ces entrees sont NECESSAIRES, pas
  // decoratives : sans elles, un sous-compte a qui l'on n'accorde QUE des pages
  // Konnect ne trouve aucune URL et retombe sur l'ecran vide « aucun produit trouve ».
  PAGES.KONNECT_DEMANDES_RAPPEL,
  PAGES.KONNECT_DASHBOARD,
  PAGES.KONNECT_STATS,
  PAGES.KONNECT_EXAMENS,
  PAGES.KONNECT_PARAMETRAGE,
  PAGES.KONNECT_SITES,
  PAGES.KONNECT_ENTONNOIR,
  PAGES.KONNECT_PAIRES,
  PAGES.KONNECT_REGLES_FUSION,
  PAGES.KONNECT_REGLES_COEXISTENCE,
  PAGES.KONNECT_CRENEAUX,
  PAGES.KONNECT_MOTS,
  PAGES.KONNECT_REGLES_CLINIQUES,
];

/**
 * Construit l'URL absolue d'une page a partir de la PageKey et du `userId` du
 * client.
 *
 * Retourne null si la page necessite un centre qui n'est pas fourni
 * (ex: ORDONNANCES sans userId -> aucune URL possible).
 *
 * PRENAIT UN `talkId` (le userProductId LyraeTalk) jusqu'au chantier U du
 * 31/08/2026. Les appelants devaient donc charger les produits du client avant
 * de pouvoir construire la moindre redirection ; le `userId` de la session
 * suffit desormais. La distinction admin / client a disparu en meme temps : les
 * deux roles partagent la meme adresse.
 */
export function getClientPathForPage(
  page: PageKey,
  userId: number | null
): string | null {
  if (page === PAGES.TICKETS) return "/client/ticket";
  if (userId == null) return null;

  // Konnect (14/09/2026). Meme racine `/client/c/{userId}`, autre produit.
  const baseKonnect = `/client/c/${userId}/konnect`;
  switch (page) {
    case PAGES.KONNECT_DASHBOARD:
      return baseKonnect;
    case PAGES.KONNECT_PARAMETRAGE:
      return `${baseKonnect}/parametrage`;
    case PAGES.KONNECT_EXAMENS:
      return `${baseKonnect}/examens`;
    case PAGES.KONNECT_SITES:
      return `${baseKonnect}/sites`;
    case PAGES.KONNECT_ENTONNOIR:
      return `${baseKonnect}/ordre-entonnoir`;
    case PAGES.KONNECT_REGLES_FUSION:
      return `${baseKonnect}/regles-fusion`;
    case PAGES.KONNECT_REGLES_COEXISTENCE:
      return `${baseKonnect}/regles-coexistence`;
    case PAGES.KONNECT_CRENEAUX:
      return `${baseKonnect}/ordre-creneaux`;
    case PAGES.KONNECT_PAIRES:
      return `${baseKonnect}/paires-examens`;
    case PAGES.KONNECT_MOTS:
      return `${baseKonnect}/mots-cabinet`;
    case PAGES.KONNECT_REGLES_CLINIQUES:
      return `${baseKonnect}/regles-cliniques`;
    case PAGES.KONNECT_DEMANDES_RAPPEL:
      return `${baseKonnect}/demandes-rappel`;
    case PAGES.KONNECT_STATS:
      return `${baseKonnect}/statistiques`;
  }

  const base = `/client/c/${userId}/talk`;
  switch (page) {
    case PAGES.DASHBOARD:
      return base;
    case PAGES.PARAMETRAGE:
      return `${base}/parametrage`;
    case PAGES.MAPPING_EXAM:
      return `${base}/parametrage/mapping_exam`;
    case PAGES.QUESTIONS_EXAM:
      return `${base}/parametrage/questions_exam`;
    case PAGES.INFORMATIONNEL:
      return `${base}/informationnel`;
    case PAGES.PLANNING_COMPLET:
      return `${base}/planning-complet`;
    case PAGES.ORDONNANCES:
      return `${base}/ordonnances-manquantes`;
    case PAGES.INCIDENTS:
      return `${base}/incidents`;
    case PAGES.CALLS:
      return `${base}/calls`;
    case PAGES.STATS_APPEL:
      return `${base}/stats_appel`;
    case PAGES.STATS_NO_SHOW:
      return `${base}/stats-no-show`;
    default:
      return null;
  }
}

/**
 * Retourne l'URL de la premiere page accessible pour ce subject, en suivant
 * PAGE_PRIORITY. Renvoie null si aucune page n'est accessible OU si toutes
 * les pages accessibles necessitent un talkId non fourni.
 *
 * Fallback ultime si null : "/client" (empty state qui affiche "Aucun
 * produit trouve").
 */
export function getFirstAccessiblePath(
  subject: PermissionSubject,
  userId: number | null
): string | null {
  for (const page of PAGE_PRIORITY) {
    if (!hasPermission(subject, page, "read")) continue;
    const url = getClientPathForPage(page, userId);
    if (url) return url;
  }
  return null;
}

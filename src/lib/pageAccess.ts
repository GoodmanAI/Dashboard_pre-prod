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

  // Talk sous-sections
  { pattern: /\/services\/talk\/\d+\/parametrage\/mapping_exam(?:\/|$)/, page: PAGES.MAPPING_EXAM },
  { pattern: /\/services\/talk\/\d+\/parametrage\/questions_exam(?:\/|$)/, page: PAGES.QUESTIONS_EXAM },
  { pattern: /\/services\/talk\/\d+\/parametrage(?:\/|$)/, page: PAGES.PARAMETRAGE },
  { pattern: /\/services\/talk\/\d+\/informationnel(?:\/|$)/, page: PAGES.INFORMATIONNEL },
  { pattern: /\/services\/talk\/\d+\/planning-complet(?:\/|$)/, page: PAGES.PLANNING_COMPLET },
  { pattern: /\/services\/talk\/\d+\/ordonnances-manquantes(?:\/|$)/, page: PAGES.ORDONNANCES },
  { pattern: /\/services\/talk\/\d+\/incidents(?:\/|$)/, page: PAGES.INCIDENTS },
  { pattern: /\/services\/talk\/\d+\/stats-no-show(?:\/|$)/, page: PAGES.STATS_NO_SHOW },
  { pattern: /\/services\/talk\/\d+\/stats_appel(?:\/|$)/, page: PAGES.STATS_APPEL },
  { pattern: /\/services\/talk\/\d+\/calls(?:\/|$)/, page: PAGES.CALLS },

  // Page racine talk (redirige generalement vers parametrage cote UI)
  { pattern: /\/services\/talk\/\d+\/?$/, page: PAGES.DASHBOARD },

  // Dashboard racine
  { pattern: /^\/client\/?$/, page: PAGES.DASHBOARD },
  { pattern: /^\/admin\/?$/, page: PAGES.DASHBOARD },
];

/**
 * Deduit la PageKey d'un pathname. Retourne null si le pathname ne correspond
 * a aucune page connue (auquel cas le middleware/layout laisse passer :
 * pages "utilitaires" comme /client/profile, /admin/settings, etc.).
 */
export function getPageFromPathname(pathname: string): PageKey | null {
  for (const { pattern, page } of PATH_MATCHERS) {
    if (pattern.test(pathname)) return page;
  }
  return null;
}

/**
 * Deduit la PageKey d'un href sidebar (peut contenir {TALK_ID} non resolu).
 * Meme logique que getPageFromPathname mais tolere les placeholders.
 */
export function getPageFromHref(href: string): PageKey | null {
  // Remplace {TALK_ID} par un id fictif pour matcher les regex
  return getPageFromPathname(href.replace("{TALK_ID}", "0"));
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
];

/**
 * Construit l'URL absolue d'une page pour un CLIENT ou sous-compte a partir
 * de la PageKey et de son talkId (userProductId LyraeTalk).
 *
 * Retourne null si la page necessite un talkId qui n'est pas fourni
 * (ex: ORDONNANCES sans talkId -> aucune URL possible).
 *
 * Note : pour les ADMIN/SUPER_ADMIN, le path est different (/admin/clients/...)
 * mais ce fallback n'a de sens que pour les CLIENT ; les admins tombent
 * naturellement sur /admin/overview via leur redirect racine.
 */
export function getClientPathForPage(
  page: PageKey,
  talkId: number | null
): string | null {
  if (page === PAGES.TICKETS) return "/client/ticket";
  if (talkId == null) return null;
  const base = `/client/services/talk/${talkId}`;
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
  talkId: number | null
): string | null {
  for (const page of PAGE_PRIORITY) {
    if (!hasPermission(subject, page, "read")) continue;
    const url = getClientPathForPage(page, talkId);
    if (url) return url;
  }
  return null;
}

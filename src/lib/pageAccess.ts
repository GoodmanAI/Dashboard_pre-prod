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

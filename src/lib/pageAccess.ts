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

import { PageKey, PAGES } from "./permissions";

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

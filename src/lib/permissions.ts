/**
 * Permissions granulaires par page (chantier 3, Lot A).
 * -----------------------------------------------------------------------------
 * Modele :
 *   - SUPER_ADMIN / ADMIN : acces complet, la valeur `permissions` en base
 *     est ignoree.
 *   - CLIENT sans `permissions` set (null) : compte principal, acces complet
 *     a toutes les pages CLIENT (comportement historique).
 *   - CLIENT avec `permissions` set : sous-compte, acces granulaire par page.
 *     Une page absente ou "none" = pas d'acces. Sinon "read" ou "write".
 *
 * Retrocompat isSecretary :
 *   - Les CLIENT flagges `isSecretary` heritent d'un profil "read only sur
 *     les pages parametrage, write sur le reste" tant qu'ils n'ont pas de
 *     `permissions` custom set. A terme, `isSecretary` sera migre vers un
 *     preset permissions et le champ retire.
 */

export const PAGES = {
  DASHBOARD: "dashboard",
  PARAMETRAGE: "parametrage",
  MAPPING_EXAM: "mapping_exam",
  QUESTIONS_EXAM: "questions_exam",
  PLANNING_COMPLET: "planning_complet",
  INFORMATIONNEL: "informationnel",
  ORDONNANCES: "ordonnances",
  CALLS: "calls",
  STATS: "stats",
  STATS_APPEL: "stats_appel",
  STATS_NO_SHOW: "stats_no_show",
  INCIDENTS: "incidents",
  TICKETS: "tickets",
} as const;

export type PageKey = (typeof PAGES)[keyof typeof PAGES];

/** Metadata affichee dans l'UI de gestion des sous-comptes. */
export const PAGE_LABELS: Record<PageKey, string> = {
  [PAGES.DASHBOARD]: "Dashboard",
  [PAGES.PARAMETRAGE]: "Parametrage",
  [PAGES.MAPPING_EXAM]: "Mapping examens",
  [PAGES.QUESTIONS_EXAM]: "Questions examens",
  [PAGES.PLANNING_COMPLET]: "Planning complet",
  [PAGES.INFORMATIONNEL]: "Informationnel",
  [PAGES.ORDONNANCES]: "Ordonnances",
  [PAGES.CALLS]: "Appels",
  [PAGES.STATS]: "Statistiques",
  [PAGES.STATS_APPEL]: "Stats appels",
  [PAGES.STATS_NO_SHOW]: "Stats no-show",
  [PAGES.INCIDENTS]: "Incidents",
  [PAGES.TICKETS]: "Support (tickets)",
};

export type AccessLevel = "none" | "read" | "write";

export type PermissionsMap = Partial<Record<PageKey, AccessLevel>>;

/**
 * Minimal shape needed pour resoudre les permissions.
 * Compatible avec Session.user et Prisma User (partiel).
 */
export interface PermissionSubject {
  role: string | null | undefined;
  isSecretary?: boolean | null;
  permissions?: unknown;
}

/**
 * Pages en "lecture seule" pour un secretaire retrocompat (isSecretary=true
 * sans permissions custom set). Toutes les autres pages restent "write".
 */
const SECRETARY_READONLY_PAGES: PageKey[] = [
  PAGES.PARAMETRAGE,
  PAGES.MAPPING_EXAM,
  PAGES.QUESTIONS_EXAM,
  PAGES.PLANNING_COMPLET,
  PAGES.INFORMATIONNEL,
];

/**
 * Parse un JSON permissions arbitraire. Retourne null si le format n'est
 * pas un objet exploitable (protection contre les vieux JWT ou une base
 * corrompue).
 */
function parsePermissions(raw: unknown): PermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: PermissionsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "none" || value === "read" || value === "write") {
      out[key as PageKey] = value;
    }
  }
  return out;
}

/**
 * Verifie si un user peut acceder a une page a un niveau donne.
 *   - level = "read"  : autorise si read OU write
 *   - level = "write" : autorise seulement si write
 */
export function hasPermission(
  subject: PermissionSubject,
  page: PageKey,
  level: "read" | "write"
): boolean {
  if (!subject?.role) return false;

  // SUPER_ADMIN / ADMIN : bypass total
  if (subject.role === "SUPER_ADMIN" || subject.role === "ADMIN") return true;

  if (subject.role !== "CLIENT") return false;

  const perms = parsePermissions(subject.permissions);

  // CLIENT avec permissions custom : sous-compte, check granulaire
  if (perms) {
    const pageLevel = perms[page];
    if (!pageLevel || pageLevel === "none") return false;
    if (level === "read") return true; // read || write couvrent tous les 2
    return pageLevel === "write";
  }

  // CLIENT sans permissions custom + isSecretary : preset legacy
  if (subject.isSecretary) {
    const isReadOnlyForSecretary = SECRETARY_READONLY_PAGES.includes(page);
    if (isReadOnlyForSecretary && level === "write") return false;
    return true;
  }

  // CLIENT sans permissions custom : acces complet (compte principal)
  return true;
}

/**
 * Retourne la liste des pages accessibles en lecture pour ce subject.
 * Utile pour filtrer la sidebar cote UI.
 */
export function getAccessiblePages(subject: PermissionSubject): PageKey[] {
  return (Object.values(PAGES) as PageKey[]).filter((page) =>
    hasPermission(subject, page, "read")
  );
}

/**
 * True si l'user a un `permissions` JSONB set (donc sous-compte).
 * Distinction utile UI pour badger le compte.
 */
export function isSubAccount(subject: PermissionSubject): boolean {
  return parsePermissions(subject.permissions) !== null;
}

/**
 * True si le role est ADMIN ou SUPER_ADMIN. Utilise partout ou l'ancien code
 * comparait role === "ADMIN" pour donner un acces "admin-like". Le
 * SUPER_ADMIN herite de toutes les capacites ADMIN sans exception.
 */
export function isAdminLike(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

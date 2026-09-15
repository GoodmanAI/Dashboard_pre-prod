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
  // --- LyraeTalk ---
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

  // --- LyraeKonnect (ajoutees le 14/09/2026) ---
  //
  // Les treize ecrans Konnect n'etaient declares NULLE PART dans ce modele. Comme une
  // URL non reconnue par `pageAccess.ts` laisse passer, ils n'etaient gardes par rien :
  // un sous-compte a qui l'on n'avait coche que « Statistiques » voyait les quatorze
  // entrees du menu Konnect et pouvait enregistrer le mapping d'examens.
  //
  // Le prefixe `konnect_` n'est pas cosmetique. Un client porte les deux produits, et
  // un sous-compte peut legitimement ecrire le parametrage de Talk tout en lisant
  // seulement celui de Konnect. Reutiliser `parametrage` ou `mapping_exam` fusionnerait
  // les deux droits en un seul.
  KONNECT_DASHBOARD: "konnect_dashboard",
  KONNECT_PARAMETRAGE: "konnect_parametrage",
  KONNECT_EXAMENS: "konnect_examens",
  KONNECT_SITES: "konnect_sites",
  KONNECT_ENTONNOIR: "konnect_entonnoir",
  KONNECT_REGLES_FUSION: "konnect_regles_fusion",
  KONNECT_REGLES_COEXISTENCE: "konnect_regles_coexistence",
  KONNECT_CRENEAUX: "konnect_creneaux",
  KONNECT_PAIRES: "konnect_paires",
  KONNECT_MOTS: "konnect_mots",
  KONNECT_REGLES_CLINIQUES: "konnect_regles_cliniques",
  KONNECT_DEMANDES_RAPPEL: "konnect_demandes_rappel",
  KONNECT_STATS: "konnect_stats",

  // --- Transverse ---
  TICKETS: "tickets",
} as const;

export type PageKey = (typeof PAGES)[keyof typeof PAGES];

/**
 * Regroupement pour l'ecran d'edition des sous-comptes.
 *
 * `PermissionsGrid` rendait une liste plate. A treize pages c'etait lisible ; a
 * vingt-six, il faut des sections, sinon on coche au hasard. L'ordre des groupes est
 * celui du menu, pour qu'on retrouve une page la ou on l'a vue.
 *
 * Toute page ajoutee a `PAGES` doit entrer dans un groupe : le test de coherence en
 * bas de ce fichier echoue sinon.
 */
export const PAGE_GROUPS: { titre: string; pages: PageKey[] }[] = [
  {
    titre: "LyraeTalk",
    pages: [
      PAGES.DASHBOARD,
      PAGES.PARAMETRAGE,
      PAGES.MAPPING_EXAM,
      PAGES.QUESTIONS_EXAM,
      PAGES.PLANNING_COMPLET,
      PAGES.INFORMATIONNEL,
      PAGES.ORDONNANCES,
      PAGES.CALLS,
      PAGES.STATS,
      PAGES.STATS_APPEL,
      PAGES.STATS_NO_SHOW,
      PAGES.INCIDENTS,
    ],
  },
  {
    titre: "LyraeKonnect",
    pages: [
      PAGES.KONNECT_DASHBOARD,
      PAGES.KONNECT_PARAMETRAGE,
      PAGES.KONNECT_EXAMENS,
      PAGES.KONNECT_SITES,
      PAGES.KONNECT_ENTONNOIR,
      PAGES.KONNECT_REGLES_FUSION,
      PAGES.KONNECT_REGLES_COEXISTENCE,
      PAGES.KONNECT_CRENEAUX,
      PAGES.KONNECT_PAIRES,
      PAGES.KONNECT_MOTS,
      PAGES.KONNECT_REGLES_CLINIQUES,
      PAGES.KONNECT_DEMANDES_RAPPEL,
      PAGES.KONNECT_STATS,
    ],
  },
  {
    titre: "Transverse",
    pages: [PAGES.TICKETS],
  },
];

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

  [PAGES.KONNECT_DASHBOARD]: "Accueil Konnect",
  [PAGES.KONNECT_PARAMETRAGE]: "Paramètres du portail",
  [PAGES.KONNECT_EXAMENS]: "Mapping d'examens",
  [PAGES.KONNECT_SITES]: "Sites",
  [PAGES.KONNECT_ENTONNOIR]: "Ordre de l'entonnoir",
  [PAGES.KONNECT_REGLES_FUSION]: "Règles de fusion",
  [PAGES.KONNECT_REGLES_COEXISTENCE]: "Règles de coexistence",
  [PAGES.KONNECT_CRENEAUX]: "Ordre des créneaux",
  [PAGES.KONNECT_PAIRES]: "Examens qui vont ensemble",
  [PAGES.KONNECT_MOTS]: "Mots du cabinet",
  [PAGES.KONNECT_REGLES_CLINIQUES]: "Règles cliniques",
  [PAGES.KONNECT_DEMANDES_RAPPEL]: "Demandes de rappel",
  [PAGES.KONNECT_STATS]: "Statistiques Konnect",

  [PAGES.TICKETS]: "Support (tickets)",
};

/** Toute page de `PAGES` doit appartenir a exactement un groupe. */
const _pagesGroupees = PAGE_GROUPS.flatMap((g) => g.pages);
const _pagesManquantes = (Object.values(PAGES) as PageKey[]).filter(
  (p) => !_pagesGroupees.includes(p)
);
if (_pagesManquantes.length > 0) {
  // Volontairement bruyant au chargement du module : une page absente de
  // `PAGE_GROUPS` serait invisible dans l'ecran d'edition des sous-comptes, donc
  // impossible a accorder. C'est exactement le defaut qu'on vient de refermer.
  throw new Error(
    `PAGE_GROUPS incomplet : ${_pagesManquantes.join(", ")} n'appartiennent a aucun groupe.`
  );
}

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
  /**
   * Le compte parent, s'il y en a un. Nécessaire à `isSubAccount` depuis le
   * 15/09/2026 : la présence de permissions ne suffit plus à distinguer un
   * sous-compte d'un compte principal secrétaire.
   *
   * Optionnel, parce que `hasPermission` n'en a pas besoin : un droit se lit sur le
   * compte lui-même, jamais sur son parent.
   */
  managerId?: number | null;
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

  // Konnect, ajoutees le 14/09/2026 AVEC les pages elles-memes, et l'ordre importait.
  //
  // Le preset herite accorde `write` a TOUTE page absente de cette liste. Declarer les
  // ecrans Konnect sans les ajouter ici aurait donc donne l'ecriture sur la
  // configuration complete du portail a chaque compte `isSecretary` existant, en
  // silence, au premier deploiement. La configuration de Konnect suit la meme regle que
  // celle de Talk : une secretaire la consulte, elle ne la change pas.
  PAGES.KONNECT_PARAMETRAGE,
  PAGES.KONNECT_EXAMENS,
  PAGES.KONNECT_SITES,
  PAGES.KONNECT_ENTONNOIR,
  PAGES.KONNECT_REGLES_FUSION,
  PAGES.KONNECT_REGLES_COEXISTENCE,
  PAGES.KONNECT_CRENEAUX,
  PAGES.KONNECT_PAIRES,
  PAGES.KONNECT_MOTS,
  PAGES.KONNECT_REGLES_CLINIQUES,

  // `KONNECT_DEMANDES_RAPPEL` reste en ecriture, et c'est deliberé : marquer un patient
  // comme rappele est precisement le travail d'une secretaire, pas de la configuration.
  // `KONNECT_STATS` et `KONNECT_DASHBOARD` sont en lecture seule par nature.
];

/**
 * Le préréglage « secrétaire », sous forme de permissions explicites.
 *
 * Ajouté le 15/09/2026, pour sortir du booléen `User.isSecretary`. Il donne le même
 * résultat que la branche héritée de `hasPermission` : lecture seule sur les pages de
 * configuration, écriture partout ailleurs.
 *
 * **Pourquoi c'est un progrès et pas un simple déplacement.** Le booléen est une règle
 * implicite qui s'applique à toute page, y compris celles qui n'existaient pas quand il
 * a été écrit. C'est exactement le piège rencontré le 14/09 : déclarer les treize pages
 * Konnect aurait accordé l'écriture sur toute la configuration du portail à chaque
 * compte secrétaire, en silence, parce que le préréglage accorde `write` à toute page
 * **absente** de `SECRETARY_READONLY_PAGES`. Des permissions explicites, elles, ne
 * bougent pas quand le catalogue de pages grandit.
 *
 * Posé à la création d'un compte secrétaire (`/api/admin/create-client`). Les comptes
 * existants continuent de passer par la branche héritée jusqu'à leur reprise : le script
 * `scripts/data-provisioning/2026_09_15_preset_secretaire.sql` la fait.
 */
export function presetSecretaire(): PermissionsMap {
  const preset: PermissionsMap = {};
  for (const page of Object.values(PAGES) as PageKey[]) {
    preset[page] = SECRETARY_READONLY_PAGES.includes(page) ? "read" : "write";
  }
  return preset;
}

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
 * True si le compte est un SOUS-COMPTE : rattaché à un compte parent ET porteur de
 * ses propres permissions.
 *
 * ⚠️ **Le test portait sur les seules permissions jusqu'au 15/09/2026**, et il a cessé
 * d'être juste le jour même : depuis que `/api/admin/create-client` écrit le préréglage
 * secrétaire en clair, un compte secrétaire **principal** porte un JSON de permissions
 * sans avoir de parent. Il serait apparu dans l'onglet « Sous-comptes », alors qu'il est
 * le compte principal de son client.
 *
 * Les deux conditions sont nécessaires, et chacune écarte un cas réel :
 *
 * | Compte | `managerId` | `permissions` | Sous-compte ? |
 * |---|---|---|---|
 * | Principal, secrétaire ou non | `null` | posé ou non | **non** |
 * | Rattaché multi-sites (`centreRole = USER`) | posé | `null` | **non**, c'est un centre de plus, pas un accès restreint |
 * | Sous-compte | posé | posé | **oui** |
 */
export function isSubAccount(subject: PermissionSubject): boolean {
  const aUnParent = subject.managerId !== null && subject.managerId !== undefined;
  return aUnParent && parsePermissions(subject.permissions) !== null;
}

/**
 * True si le role est ADMIN ou SUPER_ADMIN. Utilise partout ou l'ancien code
 * comparait role === "ADMIN" pour donner un acces "admin-like". Le
 * SUPER_ADMIN herite de toutes les capacites ADMIN sans exception.
 */
export function isAdminLike(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Les deux espaces internes servis par ce dépôt : le Dashboard et Pilot (CRM
 * interne, `src/pilot`). Plan : lyrae/plans/2026-11-pilot-dans-le-dashboard.md.
 *
 * Module sans dépendance serveur : le middleware (Edge) et les composants client
 * l'importent. Les adresses publiques viennent de variables `NEXT_PUBLIC_*`,
 * inlinées au build ; vides en local, tout reste sur le même hôte
 * (`localhost:3000/pilot`).
 */

/** Hôte de Pilot en production. Sert aussi de valeur par défaut au middleware. */
export const HOTE_PILOT_PROD = "pilote.dashboard.neuracorp.ai";

/** `https://pilote.dashboard.neuracorp.ai`, sans barre finale. Vide en local. */
export const URL_PILOT = (process.env.NEXT_PUBLIC_PILOT_URL ?? "").replace(/\/+$/, "");
/** `https://dashboard.neuracorp.ai`, sans barre finale. Vide en local. */
export const URL_DASHBOARD = (process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "").replace(/\/+$/, "");

/** Vrai pour l'hôte de Pilot, et pour `pilote.localhost` en développement. */
export function estHotePilot(hote: string | null | undefined): boolean {
  if (!hote) return false;
  const h = hote.split(":")[0].toLowerCase();
  const attendu = (process.env.PILOT_HOST || HOTE_PILOT_PROD).toLowerCase();
  return h === attendu || h === "pilote.localhost";
}

/** Un chemin de Pilot : pages `/pilot` et routes `/api/pilot`. */
export function estCheminPilot(chemin: string): boolean {
  return /^\/pilot(\/|$)/.test(chemin) || /^\/api\/pilot(\/|$)/.test(chemin);
}

/**
 * Ce que l'hôte de Pilot sert en plus de Pilot lui-même : la connexion (partagée),
 * la cloche commune, le socket des notifications, les fichiers statiques.
 * Tout le reste renvoie au Dashboard.
 */
const PARTAGES_SUR_PILOT: RegExp[] = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/notification\//,
  /^\/api\/socket$/,
  // Lus par les écrans venus de l'admin (installation des centres dans « Parc », Versions en ligne).
  /^\/api\/centre-statut$/,
  /^\/api\/completude$/,
  /^\/api\/deployments$/,
  /^\/authentication(\/|$)/,
  /^\/_next\//,
  /^\/images\//,
  /^\/fonts\//,
  /^\/favicon\.ico$/,
];

export function partageSurPilot(chemin: string): boolean {
  return PARTAGES_SUR_PILOT.some((re) => re.test(chemin));
}

/** L'adresse à ouvrir pour un chemin interne, sur le bon espace (absolue si l'autre espace a son hôte). */
export function adresseDansSonEspace(chemin: string, surPilot: boolean): string {
  const versPilot = estCheminPilot(chemin);
  if (versPilot && !surPilot && URL_PILOT) return URL_PILOT + chemin;
  if (!versPilot && surPilot && URL_DASHBOARD) return URL_DASHBOARD + chemin;
  return chemin;
}

/**
 * Lecture seule des comptes ADMIN au Dashboard (demande d'Enzo du 23/11/2026) :
 * seul le super-administrateur change la configuration et les paramètres. Les
 * comptes internes de l'équipe consultent tout, et n'écrivent que ce qui suit,
 * qui n'est pas de la configuration : Pilot (qui garde ses propres droits), les
 * notifications, leur propre mot de passe, la recherche, le support, le
 * traitement des listes du quotidien.
 *
 * **Refus par défaut** : une route d'écriture ajoutée demain est protégée sans y
 * penser. Pour l'ouvrir aux comptes internes, l'ajouter ici, en disant pourquoi
 * ce n'est pas de la configuration.
 */
const ECRITURES_PERMISES_AUX_ADMIN: RegExp[] = [
  /^\/api\/pilot(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/notification\/(mark-read|mark-all-read)$/,
  /^\/api\/client\/(change-password|deconnecter-partout)$/,
  /^\/api\/premiers-pas$/,
  // Recherche et lectures envoyées en POST.
  /^\/api\/recherche(\/voix)?$/,
  /^\/api\/configuration\/get\/mapping\/getLibelle$/,
  // Un test de créneaux lit l'agenda, il n'écrit aucun réglage.
  /^\/api\/configuration\/mapping\/test-creneaux$/,
  // Support.
  /^\/api\/tickets$/,
  /^\/api\/tickets\/\d+\/(messages|status)$/,
  // Le quotidien d'un centre : appels traités ou signalés, ordonnances, rappels, file d'attente.
  /^\/api\/calls\/[^/]+\/(flag|treated)$/,
  /^\/api\/prescriptions\/alerts\/[^/]+\/(resolve|suivi)$/,
  /^\/api\/prescriptions\/rejected\/[^/]+\/resolve$/,
  /^\/api\/prescriptions\/par-mail\/[^/]+\/ranger$/,
  /^\/api\/konnect-demandes-rappel$/,
  /^\/api\/konnect-file-attente\/(ecran|transition)$/,
];

const METHODES_QUI_ECRIVENT = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Vrai si un compte ADMIN (pas SUPER_ADMIN) doit être refusé sur cette requête. */
export function ecritureRefuseeAuxAdmin(methode: string, chemin: string): boolean {
  if (!METHODES_QUI_ECRIVENT.has(methode.toUpperCase())) return false;
  if (!chemin.startsWith("/api/")) return false;
  return !ECRITURES_PERMISES_AUX_ADMIN.some((re) => re.test(chemin));
}

export const MESSAGE_LECTURE_SEULE =
  "Seul le super-administrateur peut modifier la configuration. Votre compte la consulte en lecture seule.";

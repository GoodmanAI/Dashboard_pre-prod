/**
 * Une session refusée (C-61). Module sans dépendance serveur : le middleware,
 * qui tourne à la périphérie, l'importe aussi.
 */

/** Posé par le middleware sur chaque requête connectée : le chemin demandé, recherche comprise. */
export const ENTETE_CHEMIN = "x-pilot-chemin";

/** Pas de session, ou un compte qui n'existe plus ; ou un compte qui n'a plus le droit d'ouvrir Pilot. */
export type RaisonRefus = "session" | "acces";

export const MESSAGES_REFUS: Record<RaisonRefus, string> = {
  session: "Votre session a pris fin. Reconnectez-vous.",
  acces: "Ce compte n'a plus accès à Pilot. Demandez l'accès à un super-administrateur.",
};

/**
 * Où envoyer une page refusée. Une API, ou un appel dont le chemin est inconnu,
 * n'est pas redirigé : il répond 401, comme avant.
 */
export function adresseDeConnexion(chemin: string | null, raison: RaisonRefus): string | null {
  if (!chemin || chemin.startsWith("/api/")) return null;
  // La connexion du Dashboard, servie aussi sur l'hôte de Pilot : la page y revient après.
  return `/authentication/signin?${new URLSearchParams({ callbackUrl: chemin, raison })}`;
}

/** La raison lue dans l'adresse de la connexion, si elle est connue. */
export function raisonDeRefus(valeur: string | null): RaisonRefus | null {
  return valeur === "session" || valeur === "acces" ? valeur : null;
}

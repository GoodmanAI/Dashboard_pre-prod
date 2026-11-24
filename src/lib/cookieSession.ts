/**
 * Le cookie de session NextAuth, partagé entre le Dashboard et Pilot
 * (plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md).
 *
 * `AUTH_COOKIE_DOMAIN=dashboard.neuracorp.ai` en production : le cookie part vers
 * `dashboard.neuracorp.ai` et ses sous-domaines (`pilote.dashboard.neuracorp.ai`),
 * jamais vers `rdv.neuracorp.ai` ni `depot-ordonnances.neuracorp.ai`, les pages
 * patient. Vide en local : cookie lié à l'hôte, comme avant.
 *
 * Le nom reste celui que NextAuth choisit seul (préfixe `__Secure-` en https) :
 * poser le domaine ne change pas le nom, et le middleware le relit par la même
 * fonction. Changer le domaine déconnecte tout le monde une fois.
 */
const BASE = "next-auth.session-token";

export function cookiesSecurises(): boolean {
  return (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
}

export function nomCookieSession(): string {
  return cookiesSecurises() ? `__Secure-${BASE}` : BASE;
}

export function domaineCookie(): string | undefined {
  const d = (process.env.AUTH_COOKIE_DOMAIN ?? "").trim().replace(/^\./, "");
  return d || undefined;
}

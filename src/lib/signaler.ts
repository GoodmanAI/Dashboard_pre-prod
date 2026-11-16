/**
 * Erreur rencontrée dans le navigateur (16/11/2026).
 *
 * Visible dans la console en développement, muette en production : un client qui ouvre
 * la console ne doit y lire ni journal de débogage ni pile d'erreur. `process.env.NODE_ENV`
 * est remplacé au build, la branche disparaît donc du code envoyé au navigateur.
 *
 * L'écran dit lui-même ce qui a échoué et quoi faire : c'est là que l'utilisateur
 * l'apprend, pas dans la console. Côté serveur (routes `/api`, `src/lib`), les journaux
 * restent `console.*` : ils partent dans PM2 et Loki, et `auditLog` est lu par Grafana.
 *
 * Interdit ailleurs côté navigateur : règle `no-console` de `.eslintrc.json`.
 */
export function signaler(...details: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(...details);
  }
}

import { db } from "@/lib/db";

/**
 * Rate limiting IP-based sur les endpoints publics de depot d'ordonnance.
 *
 * Approche : requetage de la table PrescriptionAccessLog (deja alimentee par
 * les endpoints upload/status). Pas de table dediee ni de Redis — l'audit
 * trail existant fait office de compteur glissant.
 *
 * Deux limites appliquees en OR (une seule declenchee = ban 15 min) :
 *   - Trop d'appels au total (upload + code_failed) → suggeste un scan bot
 *   - Trop d'echecs code specifiquement → suggeste un brute-force ciblee
 *
 * Bornes generees pour cibler un utilisateur legitime :
 *   - Un patient a un lien SMS et depose 1 fichier → 1-3 requetes
 *   - Un patient qui essaie 3 codes puis abandonne → 3 requetes
 *   - Un scanner bot (curl script) → 100+ requetes/heure sur IPs multiples
 *
 * On accepte 20 appels/heure/IP avant de bloquer. Sur une box familiale ou
 * pro derriere NAT, 20 patients qui deposent en 1h depuis la meme IP
 * publique reste plausible sans trigger — 100 non.
 */

const WINDOW_INTERVAL = "1 hour";
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_CODE_FAILURES_PER_WINDOW = 10;

export type RateLimitCheck =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSeconds: number };

/**
 * Verifie que l'IP donnee n'a pas depasse les seuils. NULL IP (header
 * x-forwarded-for absent) → autorise, on ne peut pas bloquer aveuglement
 * sans identifier. Le rate limit nginx/fail2ban prendra le relais si vraiment
 * abusif.
 */
export async function checkRateLimit(
  ip: string | null
): Promise<RateLimitCheck> {
  if (!ip) return { allowed: true };

  const res = await db.query<{
    total_count: string;
    fail_count: string;
  }>(
    `
    SELECT
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE "action" = 'code_failed') AS fail_count
    FROM "PrescriptionAccessLog"
    WHERE "actorIp" = $1::inet
      AND "createdAt" > NOW() - INTERVAL '${WINDOW_INTERVAL}'
      AND "action" IN ('upload', 'code_failed')
    `,
    [ip]
  );
  const row = res.rows[0];
  const total = Number(row?.total_count ?? 0);
  const fails = Number(row?.fail_count ?? 0);

  if (total >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      reason: `Trop de tentatives depuis cette adresse (${total} en 1h). Reessayez plus tard.`,
      retryAfterSeconds: 900,
    };
  }
  if (fails >= MAX_CODE_FAILURES_PER_WINDOW) {
    return {
      allowed: false,
      reason: `Trop de codes incorrects depuis cette adresse (${fails} en 1h). Reessayez plus tard.`,
      retryAfterSeconds: 900,
    };
  }

  return { allowed: true };
}

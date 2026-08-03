/**
 * Audit log structured -> stdout -> Alloy -> Loki (chantier 3, Lot A).
 * -----------------------------------------------------------------------------
 * Toutes les actions sensibles ecrivent une ligne JSON sur stdout via
 * console.log. Alloy sur la VM dashboard scrape les logs PM2 et pousse vers
 * Loki avec label service=dashboard. Le champ `audit:true` permet ensuite
 * de filtrer en Grafana Explore :
 *
 *   {service="dashboard"} | json | audit="true"
 *   {service="dashboard"} | json | audit="true" | category="auth"
 *   {service="dashboard"} | json | audit="true" | actorId="42"
 *
 * Categories couvertes (les 4 valides par le user) :
 *   - auth    : login OK/KO, logout, change-password, reset-password, kick
 *   - account : create/edit/delete admin/client/sous-compte, promote role,
 *               reset password d'un autre user, edit permissions
 *   - ticket  : open, close, resolve, reassign, add-message admin
 *   - data    : delete/export PII, prescription-access (deja PrescriptionAccessLog
 *               en DB, on double en Loki pour uniformite queries),
 *               modification config sensible (external-mapping, prescriptions
 *               config, sms confirmation)
 *
 * Fail-open : jamais throw, jamais bloquer la request. Un audit qui echoue
 * a serialiser reste tracable via la ligne console.error qui suit.
 */

export type AuditCategory = "auth" | "account" | "ticket" | "data";

export interface AuditActor {
  id?: number | null;
  email?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditTarget {
  type?: string | null;
  id?: string | number | null;
  label?: string | null;
}

export interface AuditContext {
  actor?: AuditActor;
  target?: AuditTarget;
  /** Booleen : l'action a-t-elle abouti (200) ou echoue (403/500) ? */
  success?: boolean;
  /** Message d'erreur court en cas de success=false. */
  errorReason?: string | null;
  /** Champs metier libres (ex: fromStatus/toStatus pour un changement ticket). */
  metadata?: Record<string, unknown>;
}

/**
 * Emet une ligne d'audit JSON sur stdout.
 * @param category - Categorie parmi les 4 supportees.
 * @param action - Verbe court kebab-case (ex: "login", "create-client",
 *                 "close-ticket", "delete-prescription", "kick-session").
 * @param ctx - Contexte structure (actor, target, metadata).
 */
export function auditLog(
  category: AuditCategory,
  action: string,
  ctx: AuditContext = {}
): void {
  try {
    const line = JSON.stringify({
      audit: true,
      category,
      action,
      timestamp: new Date().toISOString(),
      success: ctx.success ?? true,
      // Actor
      actorId: ctx.actor?.id ?? null,
      actorEmail: ctx.actor?.email ?? null,
      actorRole: ctx.actor?.role ?? null,
      actorIp: ctx.actor?.ip ?? null,
      actorUserAgent: ctx.actor?.userAgent ?? null,
      // Target
      targetType: ctx.target?.type ?? null,
      targetId: ctx.target?.id ?? null,
      targetLabel: ctx.target?.label ?? null,
      // Erreur
      errorReason: ctx.errorReason ?? null,
      // Champs metier libres (merges au top-level pour ecrasement contrele)
      ...(ctx.metadata ?? {}),
    });
    // Un seul console.log — Alloy parse ligne par ligne.
    console.log(line);
  } catch (err) {
    console.error("[auditLog] serialization failed:", err, {
      category,
      action,
    });
  }
}

/**
 * Extrait l'IP client depuis les headers d'une Request (reverse proxy aware).
 * Duplique la logique de loginSecurity.extractClientIp mais accepte
 * l'API Web Headers (Request.headers) directement.
 */
export function extractIpFromRequest(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return (
    h.get("x-real-ip") ??
    h.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Extrait le user agent en tronquant a 500 chars (protection log spam).
 */
export function extractUserAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  if (!ua) return null;
  return ua.length > 500 ? ua.slice(0, 500) : ua;
}

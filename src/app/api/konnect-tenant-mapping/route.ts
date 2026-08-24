export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";

/**
 * Correspondance cabinet Konnect <-> centre Dashboard (admin uniquement).
 *
 * Konnect identifie ses cabinets par un UUID (`tenant_id`, sa clé d'isolation
 * RLS) ; le Dashboard par un entier (`UserProduct.id`). Rien ne reliait les
 * deux. Cette route administre la table `KonnectTenantMapping`, créée par
 * `prisma/migrations/manual/2026_08_24_add_produit_konnect.sql`.
 *
 * Relation **1 ↔ 1, contrainte dans les deux sens** — contrairement à
 * `ExternalCenterMapping` (N codes → 1 UserProduct). Un `tenant_id` désigne
 * exactement un cabinet, et le chemin inverse doit être tout aussi
 * déterministe : le Dashboard devient appelant de Konnect, il doit pouvoir
 * répondre sans ambiguïté à « quel tenant pour ce centre ? ».
 *
 * Table hors `schema.prisma`, donc pool `pg` et requêtes paramétrées.
 *
 * Ces routes sont protégées par session NextAuth (admin) : elles ne doivent
 * PAS être ajoutées à `PUBLIC_API_PATTERNS` de `src/middleware.ts`. La surface
 * machine-à-machine vers Konnect, elle, viendra avec `KONNECT_API_KEY`.
 *
 *  GET    /api/konnect-tenant-mapping
 *    → tous les centres rattachés à LyraeKonnect, avec leur tenant s'il existe.
 *    → { rows: [{ userProductId, userId, userName, tenantId, mappingId }] }
 *
 *  POST   /api/konnect-tenant-mapping
 *    body : { userProductId: number, tenantId: string (UUID) }
 *    → rattache, ou remplace le tenant du centre. 409 si le tenant est déjà
 *      pris par un AUTRE centre.
 *
 *  DELETE /api/konnect-tenant-mapping?id=<mappingId>
 *    → détache. Le UserProduct et ses données ne sont pas touchés.
 */

/** Forme canonique d'un UUID — évite un 22P02 Postgres sur une saisie libre. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const res = await db.query<{
    userProductId: number;
    userId: number;
    userName: string | null;
    tenantId: string | null;
    mappingId: number | null;
  }>(
    `
    SELECT up."id"   AS "userProductId",
           u."id"    AS "userId",
           u."name"  AS "userName",
           m."tenantId",
           m."id"    AS "mappingId"
      FROM "UserProduct" up
      JOIN "User"    u ON u."id" = up."userId"
      JOIN "Product" p ON p."id" = up."productId"
      LEFT JOIN "KonnectTenantMapping" m ON m."userProductId" = up."id"
     WHERE up."removedAt" IS NULL
       AND lower(p."name") = lower($1)
     ORDER BY u."name" ASC
    `,
    [PRODUITS.konnect.nom]
  );

  return NextResponse.json({ rows: res.rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userProductId, tenantId } = body ?? {};
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 }
    );
  }
  const tenant = typeof tenantId === "string" ? tenantId.trim().toLowerCase() : "";
  if (!UUID_RE.test(tenant)) {
    return NextResponse.json(
      { error: "tenantId doit être un UUID" },
      { status: 400 }
    );
  }

  // Le centre doit exister, être actif, et porter le produit LyraeKonnect :
  // rattacher un cabinet Konnect à un centre qui n'a pas le produit n'aurait
  // aucun sens et rendrait la correspondance inexploitable.
  const upCheck = await db.query<{ id: number }>(
    `
    SELECT up."id"
      FROM "UserProduct" up
      JOIN "Product" p ON p."id" = up."productId"
     WHERE up."id" = $1
       AND up."removedAt" IS NULL
       AND lower(p."name") = lower($2)
     LIMIT 1
    `,
    [userProductId, PRODUITS.konnect.nom]
  );
  if (upCheck.rowCount === 0) {
    return NextResponse.json(
      { error: "Centre introuvable, retiré, ou non rattaché à LyraeKonnect" },
      { status: 404 }
    );
  }

  try {
    // Remplacer le tenant d'un centre est légitime (recréation d'un cabinet
    // côté Konnect) : ON CONFLICT sur userProductId met à jour plutôt que de
    // refuser. Le conflit sur tenantId, lui, reste une erreur — il signale que
    // le cabinet est déjà rattaché ailleurs.
    const ins = await db.query<{ id: number }>(
      `
      INSERT INTO "KonnectTenantMapping" ("userProductId", "tenantId")
      VALUES ($1, $2)
      ON CONFLICT ("userProductId")
        DO UPDATE SET "tenantId" = EXCLUDED."tenantId", "updatedAt" = NOW()
      RETURNING "id"
      `,
      [userProductId, tenant]
    );

    auditLog("account", "konnect-tenant-mapping-set", {
      actor: {
        id: auth.session.user.id,
        email: auth.session.user.email ?? null,
        role: auth.session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "userProduct", id: userProductId },
      metadata: { tenantId: tenant },
    });

    return NextResponse.json({ id: ins.rows[0].id, userProductId, tenantId: tenant });
  } catch (err: any) {
    // 23505 = unique_violation. Ici, seule la contrainte sur tenantId peut
    // encore se déclencher : celle sur userProductId est absorbée par ON CONFLICT.
    if (err?.code === "23505") {
      return NextResponse.json(
        { error: `Le cabinet ${tenant} est déjà rattaché à un autre centre.` },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const idParam = req.nextUrl.searchParams.get("id");
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: "Missing or invalid id query param" },
      { status: 400 }
    );
  }

  const res = await db.query<{ userProductId: number; tenantId: string }>(
    `DELETE FROM "KonnectTenantMapping" WHERE "id" = $1
     RETURNING "userProductId", "tenantId"`,
    [id]
  );

  if (res.rowCount) {
    auditLog("account", "konnect-tenant-mapping-delete", {
      actor: {
        id: auth.session.user.id,
        email: auth.session.user.email ?? null,
        role: auth.session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "userProduct", id: res.rows[0].userProductId },
      metadata: { tenantId: res.rows[0].tenantId },
    });
  }

  return NextResponse.json({ deleted: res.rowCount ?? 0 });
}

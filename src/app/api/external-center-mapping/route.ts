import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

/**
 * Gestion des mappings codes centre métier <-> UserProduct (admin only).
 *
 * Cardinalité : N codes -> 1 UserProduct. Chaque code est unique au global.
 *
 *  GET    /api/external-center-mapping
 *    → liste tous les UserProduct avec leurs codes (agrégés en array).
 *    → { rows: [{ userProductId, userName, productName, codes: [{ id, externalCenterCode }] }] }
 *
 *  POST   /api/external-center-mapping
 *    body : { userProductId: number, externalCenterCode: string }
 *    → ajoute un code à un UserProduct. Refuse si le code est déjà pris.
 *
 *  DELETE /api/external-center-mapping?id=<mappingId>
 *    → supprime un mapping précis (par son id).
 */

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const res = await db.query<{
    userProductId: number;
    userId: number;
    userName: string | null;
    productName: string;
    codes:
      | Array<{ id: number; externalCenterCode: string }>
      | null;
  }>(
    `
    SELECT up."id"   AS "userProductId",
           u."id"    AS "userId",
           u."name"  AS "userName",
           p."name"  AS "productName",
           COALESCE(
             (
               SELECT jsonb_agg(
                        jsonb_build_object(
                          'id', m."id",
                          'externalCenterCode', m."externalCenterCode"
                        )
                        ORDER BY m."externalCenterCode"
                      )
                 FROM "ExternalCenterMapping" m
                WHERE m."userProductId" = up."id"
             ),
             '[]'::jsonb
           ) AS "codes"
      FROM "UserProduct" up
      JOIN "User"    u ON u."id" = up."userId"
      JOIN "Product" p ON p."id" = up."productId"
     WHERE up."removedAt" IS NULL
     ORDER BY u."name" ASC, p."name" ASC
    `
  );

  return NextResponse.json({
    rows: res.rows.map((r) => ({ ...r, codes: r.codes ?? [] })),
  });
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

  const { userProductId, externalCenterCode } = body ?? {};
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 }
    );
  }
  const code =
    typeof externalCenterCode === "string" ? externalCenterCode.trim() : "";
  if (!code) {
    return NextResponse.json(
      { error: "externalCenterCode requis" },
      { status: 400 }
    );
  }

  // Vérifie que le UserProduct existe et n'est pas supprimé.
  const upCheck = await db.query<{ id: number }>(
    `SELECT "id" FROM "UserProduct" WHERE "id" = $1 AND "removedAt" IS NULL LIMIT 1`,
    [userProductId]
  );
  if (upCheck.rowCount === 0) {
    return NextResponse.json(
      { error: "UserProduct introuvable" },
      { status: 404 }
    );
  }

  try {
    const ins = await db.query<{ id: number }>(
      `
      INSERT INTO "ExternalCenterMapping" ("userProductId", "externalCenterCode")
      VALUES ($1, $2)
      RETURNING "id"
      `,
      [userProductId, code]
    );
    return NextResponse.json({
      id: ins.rows[0].id,
      userProductId,
      externalCenterCode: code,
    });
  } catch (err: any) {
    // 23505 = unique_violation Postgres
    if (err?.code === "23505") {
      return NextResponse.json(
        { error: `Le code "${code}" est déjà utilisé.` },
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

  const res = await db.query(
    `DELETE FROM "ExternalCenterMapping" WHERE "id" = $1`,
    [id]
  );
  return NextResponse.json({ deleted: res.rowCount ?? 0 });
}

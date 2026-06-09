import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

/**
 * Gestion du mapping externalCenterCode <-> UserProduct (admin only).
 *
 *  GET  /api/external-center-mapping
 *    → liste tous les UserProduct (avec centre, produit) et leur mapping actuel
 *      ({ userProductId, userName, productName, externalCenterCode | null }).
 *
 *  PUT  /api/external-center-mapping
 *    body : { userProductId: number, externalCenterCode: string | null }
 *    → upsert le mapping ; si externalCenterCode est null/"" → supprime le mapping.
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
    externalCenterCode: string | null;
  }>(
    `
    SELECT up."id"          AS "userProductId",
           u."id"           AS "userId",
           u."name"         AS "userName",
           p."name"         AS "productName",
           m."externalCenterCode"
      FROM "UserProduct" up
      JOIN "User"    u ON u."id" = up."userId"
      JOIN "Product" p ON p."id" = up."productId"
      LEFT JOIN "ExternalCenterMapping" m ON m."userProductId" = up."id"
     WHERE up."removedAt" IS NULL
     ORDER BY u."name" ASC, p."name" ASC
    `
  );

  return NextResponse.json({ rows: res.rows });
}

export async function PUT(req: NextRequest) {
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
    typeof externalCenterCode === "string" ? externalCenterCode.trim() : null;

  if (!code) {
    // Suppression du mapping.
    await db.query(
      `DELETE FROM "ExternalCenterMapping" WHERE "userProductId" = $1`,
      [userProductId]
    );
    return NextResponse.json({ userProductId, externalCenterCode: null });
  }

  // Vérifie que le code n'est pas déjà pris par un autre UserProduct.
  const conflict = await db.query<{ userProductId: number }>(
    `SELECT "userProductId" FROM "ExternalCenterMapping"
      WHERE "externalCenterCode" = $1 AND "userProductId" <> $2
      LIMIT 1`,
    [code, userProductId]
  );
  if (conflict.rowCount && conflict.rowCount > 0) {
    return NextResponse.json(
      {
        error: `Le code "${code}" est déjà associé à un autre service (userProductId=${conflict.rows[0].userProductId}).`,
      },
      { status: 409 }
    );
  }

  await db.query(
    `
    INSERT INTO "ExternalCenterMapping" ("userProductId", "externalCenterCode")
    VALUES ($1, $2)
    ON CONFLICT ("userProductId") DO UPDATE
      SET "externalCenterCode" = EXCLUDED."externalCenterCode"
    `,
    [userProductId, code]
  );

  return NextResponse.json({ userProductId, externalCenterCode: code });
}

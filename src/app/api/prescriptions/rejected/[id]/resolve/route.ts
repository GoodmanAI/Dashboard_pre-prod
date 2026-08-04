import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";

/**
 * POST /api/prescriptions/rejected/[id]/resolve
 *
 * Marque une ordonnance REJECTED comme traitee manuellement par la secretaire
 * (elle a telecharge le PDF et l'a redepose dans Xplore a la main). La ligne
 * sort de la file "Rejetees Xplore" et son count de badge disparait.
 *
 * Auth : session NextAuth + ownership check (via le centre de l'upload).
 *
 * Idempotent : si deja resolu, retourne 200 avec alreadyResolved=true.
 * Refuse si l'upload n'est pas REJECTED (409).
 *
 * Reponse 200 :
 *   { id, manualResolvedAt, alreadyResolved }
 */

function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const uploadId = parseInt(params.id, 10);
  if (!Number.isFinite(uploadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Recupere l'upload + resolve le userProductId via ExternalCenterMapping
  // pour le check d'ownership.
  const sel = await db.query<{
    id: number;
    status: string;
    manualResolvedAt: Date | null;
    externalCenterCode: string;
    userProductId: number | null;
  }>(
    `
    SELECT pu."id",
           pu."status",
           pu."manualResolvedAt",
           pu."externalCenterCode",
           ecm."userProductId"
      FROM "PrescriptionUpload" pu
      LEFT JOIN "ExternalCenterMapping" ecm
             ON ecm."externalCenterCode" = pu."externalCenterCode"
     WHERE pu."id" = $1
     LIMIT 1
    `,
    [uploadId]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const record = sel.rows[0];

  if (!record.userProductId) {
    return NextResponse.json(
      { error: "No UserProduct mapping for this upload's centre" },
      { status: 500 }
    );
  }

  const ownErr = await assertUserProductOwnership(auth.session, record.userProductId);
  if (ownErr) return ownErr;

  if (record.status !== "REJECTED") {
    return NextResponse.json(
      { error: `Cannot resolve manually: status is ${record.status}` },
      { status: 409 }
    );
  }

  // Idempotence
  if (record.manualResolvedAt !== null) {
    return NextResponse.json(
      {
        id: record.id,
        manualResolvedAt: record.manualResolvedAt,
        alreadyResolved: true,
      },
      { status: 200 }
    );
  }

  const upd = await db.query<{ manualResolvedAt: Date }>(
    `UPDATE "PrescriptionUpload"
        SET "manualResolvedAt" = NOW()
      WHERE "id" = $1
      RETURNING "manualResolvedAt"`,
    [record.id]
  );

  // Audit
  try {
    const actorIp = extractClientIp(req);
    await db.query(
      `INSERT INTO "PrescriptionAccessLog"
         ("uploadId", "action", "actorType", "actorIp", "success")
       VALUES ($1, 'manual_resolved', 'session', $2::inet, true)`,
      [record.id, actorIp]
    );
  } catch (err) {
    console.error("[prescriptions/rejected/resolve] audit log failed:", err);
  }

  return NextResponse.json(
    {
      id: record.id,
      manualResolvedAt: upd.rows[0].manualResolvedAt,
      alreadyResolved: false,
    },
    { status: 200 }
  );
}

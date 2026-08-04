import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";

/**
 * GET /api/prescriptions/rejected?userProductId=X
 *
 * Liste les ordonnances REJETEES par Xplore (AI2Xplore a echoue apres N
 * tentatives, ordonnance a re-deposer manuellement par la secretaire).
 *
 * Filtre metier :
 *   - status = 'REJECTED'
 *   - manualResolvedAt IS NULL (secretaire n'a pas encore traite)
 *   - centre resolu via ExternalCenterMapping
 *
 * Auth : session NextAuth + ownership check sur userProductId.
 *
 * Ordre : rejectedAt ASC (les plus anciens d'abord, le plus urgent en tete).
 *
 * Reponse 200 :
 *   {
 *     userProductId,
 *     items: [{
 *       id, rdvId, phone, firstname, lastname,
 *       appointmentDate, examType,
 *       rejectedAt, rejectReason, rejectAttempts, rejectErrorType,
 *       fileSize, storagePath,  // storagePath jamais expose au client, on
 *                                // sert le PDF via /api/prescriptions/download/[id]
 *       hoursSinceRejected
 *     }]
 *   }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("userProductId");
  const userProductId = param ? parseInt(param, 10) : NaN;
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const codesRes = await db.query<{ externalCenterCode: string }>(
    `SELECT "externalCenterCode"
       FROM "ExternalCenterMapping"
      WHERE "userProductId" = $1`,
    [userProductId]
  );
  const codes = codesRes.rows.map((r) => r.externalCenterCode).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({ userProductId, items: [] });
  }

  const rowsRes = await db.query<{
    id: number;
    rdvId: string;
    phone: string;
    firstname: string;
    lastname: string;
    appointmentDate: Date | null;
    examType: string | null;
    rejectedAt: Date;
    rejectReason: string | null;
    rejectAttempts: number | null;
    rejectErrorType: string | null;
    fileSize: number | null;
    hoursSinceRejected: string;
  }>(
    `
    SELECT "id", "rdvId", "phone", "firstname", "lastname",
           "appointmentDate", "examType",
           "rejectedAt", "rejectReason", "rejectAttempts", "rejectErrorType",
           "fileSize",
           EXTRACT(EPOCH FROM (NOW() - "rejectedAt")) / 3600 AS "hoursSinceRejected"
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'REJECTED'
       AND "manualResolvedAt" IS NULL
     ORDER BY "rejectedAt" ASC
     LIMIT 500
    `,
    [codes]
  );

  const items = rowsRes.rows.map((r) => ({
    ...r,
    hoursSinceRejected: Math.round(Number(r.hoursSinceRejected) * 10) / 10,
  }));

  return NextResponse.json({ userProductId, items });
}

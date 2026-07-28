import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";

/**
 * GET /api/prescriptions/alerts?userProductId=X
 *
 * Liste les alertes actives (ordonnance manquante depuis > alertAfterHours)
 * pour un centre. Alimente le dashboard secretaire.
 *
 * Auth : session NextAuth + ownership check sur userProductId.
 *
 * Retourne les infos necessaires au rappel patient :
 *   - phone (en clair : usage legitime secretaire)
 *   - firstname/lastname
 *   - appointmentDate + examType
 *   - hoursSinceAlert / hoursSinceCreated pour l'urgence visuelle
 *
 * Reponse 200 :
 *   {
 *     userProductId,
 *     items: [{
 *       id, rdvId, phone, firstname, lastname,
 *       appointmentDate, examType, status,
 *       createdAt, alertRaisedAt,
 *       hoursSinceCreated, hoursSinceAlert
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

  // Resolution userProductId → externalCenterCodes du centre
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

  // Alertes ouvertes : cron a raise, pas resolue, pas acquittee
  const alertsRes = await db.query<{
    id: number;
    rdvId: string;
    phone: string;
    firstname: string;
    lastname: string;
    appointmentDate: Date | null;
    examType: string | null;
    status: string;
    createdAt: Date;
    alertRaisedAt: Date;
    hoursSinceCreated: string;
    hoursSinceAlert: string;
  }>(
    `
    SELECT "id", "rdvId", "phone", "firstname", "lastname",
           "appointmentDate", "examType", "status",
           "createdAt", "alertRaisedAt",
           EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600 AS "hoursSinceCreated",
           EXTRACT(EPOCH FROM (NOW() - "alertRaisedAt")) / 3600 AS "hoursSinceAlert"
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "alertRaisedAt" IS NOT NULL
       AND "alertResolvedAt" IS NULL
       AND "ackedAt" IS NULL
     ORDER BY "alertRaisedAt" ASC
     LIMIT 500
    `,
    [codes]
  );

  const items = alertsRes.rows.map((r) => ({
    ...r,
    hoursSinceCreated: Math.round(Number(r.hoursSinceCreated) * 10) / 10,
    hoursSinceAlert: Math.round(Number(r.hoursSinceAlert) * 10) / 10,
  }));

  return NextResponse.json({ userProductId, items });
}

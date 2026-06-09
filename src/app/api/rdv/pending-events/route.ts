import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const MAX_BATCH = 200;

/**
 * Appelé en polling par l'API métier (sortie internet depuis le VPN).
 * Renvoie la liste des RDV traités par le patient et non encore acquittés.
 *
 * Inclut aussi les RDV passés à EXPIRED ou LOCKED pour permettre au métier
 * de relancer ou contacter le patient.
 *
 * Query : ?limit=N (max 200)
 */
export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "100", 10) || 100, 1),
    MAX_BATCH
  );

  // Repasse les PENDING expirés à EXPIRED avant de répondre.
  await db.query(
    `UPDATE "AppointmentConfirmation"
        SET "status" = 'EXPIRED'
      WHERE "status" = 'PENDING' AND "expiresAt" < NOW()`
  );

  // Le externalCenterCode est récupéré via ExternalCenterMapping
  // (un User peut avoir plusieurs UserProduct mappés ; on prend le "LyraeTalk").
  const res = await db.query<{
    id: number;
    rdvId: string;
    status: string;
    respondedAction: string | null;
    respondedAt: Date | null;
    attempts: number;
    externalCenterCode: string | null;
  }>(
    `
    SELECT a."id", a."rdvId", a."status", a."respondedAction",
           a."respondedAt", a."attempts",
           m."externalCenterCode"
      FROM "AppointmentConfirmation" a
      LEFT JOIN "UserProduct" up
             ON up."userId" = a."centerId"
            AND up."productId" = (SELECT "id" FROM "Product" WHERE "name" = 'LyraeTalk' LIMIT 1)
            AND up."removedAt" IS NULL
      LEFT JOIN "ExternalCenterMapping" m ON m."userProductId" = up."id"
     WHERE a."status" IN ('CONFIRMED', 'CANCELLED', 'EXPIRED', 'LOCKED')
       AND a."ackedAt" IS NULL
     ORDER BY a."updatedAt" ASC
     LIMIT $1
    `,
    [limit]
  );

  return NextResponse.json({
    count: res.rowCount,
    events: res.rows,
  });
}

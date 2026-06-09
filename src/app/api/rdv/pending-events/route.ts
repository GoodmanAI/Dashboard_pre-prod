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

  // Le externalCenterCode est celui utilisé à l'init (stocké directement
  // dans AppointmentConfirmation) — pas de recalcul via mapping, ce qui
  // garantit qu'on rend exactement le code que l'API métier nous a envoyé.
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
    SELECT "id", "rdvId", "status", "respondedAction",
           "respondedAt", "attempts", "externalCenterCode"
      FROM "AppointmentConfirmation"
     WHERE "status" IN ('CONFIRMED', 'CANCELLED', 'EXPIRED', 'LOCKED')
       AND "ackedAt" IS NULL
     ORDER BY "updatedAt" ASC
     LIMIT $1
    `,
    [limit]
  );

  return NextResponse.json({
    count: res.rowCount,
    events: res.rows,
  });
}

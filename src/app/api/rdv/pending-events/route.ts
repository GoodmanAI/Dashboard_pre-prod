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
 * Query params :
 *   - `limit` : nb max d'events par appel, entre 1 et 200 (défaut 100)
 *   - `externalCenterCode` : filtre par code centre côté logiciel métier.
 *     Accepte une valeur unique ou une liste CSV (ex: "CAB-LYON,CAB-MARSEILLE").
 *     Permet à une instance AI2Xplore sandbox de ne récupérer QUE les events
 *     du client de test (évite starvation + fuite de data prod).
 *     Si absent → renvoie tous les events non-ack (comportement historique).
 */
export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "100", 10) || 100, 1),
    MAX_BATCH
  );

  // Filtre optionnel par externalCenterCode (support CSV pour multi-centres).
  // Trim + drop les entrées vides, dédup pour éviter des SQL bindings inutiles.
  const codeParam = req.nextUrl.searchParams.get("externalCenterCode");
  const externalCenterCodes = codeParam
    ? Array.from(
        new Set(
          codeParam
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        )
      )
    : null;

  // Repasse les PENDING expirés à EXPIRED avant de répondre.
  await db.query(
    `UPDATE "AppointmentConfirmation"
        SET "status" = 'EXPIRED'
      WHERE "status" = 'PENDING' AND "expiresAt" < NOW()`
  );

  // Le externalCenterCode est celui utilisé à l'init (stocké directement
  // dans AppointmentConfirmation) — pas de recalcul via mapping, ce qui
  // garantit qu'on rend exactement le code que l'API métier nous a envoyé.
  const baseSelect = `
    SELECT "id", "rdvId", "status", "respondedAction",
           "respondedAt", "attempts", "externalCenterCode"
      FROM "AppointmentConfirmation"
     WHERE "status" IN ('CONFIRMED', 'CANCELLED', 'EXPIRED', 'LOCKED')
       AND "ackedAt" IS NULL`;

  const res =
    externalCenterCodes && externalCenterCodes.length > 0
      ? await db.query<{
          id: number;
          rdvId: string;
          status: string;
          respondedAction: string | null;
          respondedAt: Date | null;
          attempts: number;
          externalCenterCode: string | null;
        }>(
          `${baseSelect}
             AND "externalCenterCode" = ANY($2::text[])
            ORDER BY "updatedAt" ASC
            LIMIT $1`,
          [limit, externalCenterCodes]
        )
      : await db.query<{
          id: number;
          rdvId: string;
          status: string;
          respondedAction: string | null;
          respondedAt: Date | null;
          attempts: number;
          externalCenterCode: string | null;
        }>(
          `${baseSelect}
            ORDER BY "updatedAt" ASC
            LIMIT $1`,
          [limit]
        );

  return NextResponse.json({
    count: res.rowCount,
    events: res.rows,
  });
}

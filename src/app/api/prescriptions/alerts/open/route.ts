import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import { centresDuFiltre } from "@/lib/prescriptionAlerts";

const MAX_ITEMS = 1000;

/**
 * GET /api/prescriptions/alerts/open
 *
 * Les alertes "ordonnance manquante" encore ouvertes, pour qu'AI2Xplore verifie
 * dans Xplore que leur RDV existe toujours (statut `S` = supprime, voir
 * POST /api/prescriptions/alerts/rdv-supprimes).
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY), comme /pending.
 *
 * Query params (au moins l'un des deux, CSV) : `externalCenterCode`,
 * `userProductId` (resolu via ExternalCenterMapping). Les deux : intersection.
 *
 * Toutes les alertes ouvertes, sans le seuil d'heures de la page : une carte
 * dont le RDV a disparu ne doit jamais apparaitre, meme plus tard.
 *
 * Aucune donnee patient : AI2Xplore n'a besoin que du numero et du centre.
 *
 * Reponse 200 : { count, items: [{ id, rdvId, externalCenterCode, jourRdv }] }
 * `jourRdv` : jour du RDV a Paris, 'AAAA-MM-JJ' (null si inconnu), compare par
 * AI2Xplore au jour de Xplore pour reporter un RDV deplace (rdv-deplaces).
 */
export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const codes = await centresDuFiltre(req.nextUrl.searchParams);
  if (codes === null) {
    return NextResponse.json(
      { error: "At least one of externalCenterCode or userProductId is required" },
      { status: 400 }
    );
  }
  if (codes.length === 0) return NextResponse.json({ count: 0, items: [] });

  const res = await db.query<{
    id: number;
    rdvId: string;
    externalCenterCode: string;
    jourRdv: string | null;
  }>(
    `SELECT "id", "rdvId", "externalCenterCode",
            to_char("appointmentDate" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS "jourRdv"
       FROM "PrescriptionUpload"
      WHERE "externalCenterCode" = ANY($1::text[])
        AND "status" = 'PENDING'
        AND "alertResolvedAt" IS NULL
        AND "ackedAt" IS NULL
      ORDER BY "id" ASC
      LIMIT $2`,
    [codes, MAX_ITEMS]
  );

  return NextResponse.json({ count: res.rowCount ?? 0, items: res.rows });
}

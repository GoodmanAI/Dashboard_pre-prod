import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import { centresDuFiltre } from "@/lib/prescriptionAlerts";
import { pieceOuverteSql } from "@/lib/piecesAttendues";

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
 * Depuis le 11/10/2026 (documents demandes) : un lien est ouvert tant qu'une
 * de ses pieces attendues (ordonnance ou document) n'est ni recue ni classee.
 * Un questionnaire manquant est ainsi clos, lui aussi, quand son RDV
 * disparait de Xplore, meme si l'ordonnance est deja arrivee.
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
    `SELECT pu."id", pu."rdvId", pu."externalCenterCode",
            to_char(pu."appointmentDate" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS "jourRdv"
       FROM "PrescriptionUpload" pu
      WHERE pu."externalCenterCode" = ANY($1::text[])
        AND pu."status" <> 'EXPIRED'
        AND ${pieceOuverteSql(null)}
      ORDER BY pu."id" ASC
      LIMIT $2`,
    [codes, MAX_ITEMS]
  );

  return NextResponse.json({ count: res.rowCount ?? 0, items: res.rows });
}

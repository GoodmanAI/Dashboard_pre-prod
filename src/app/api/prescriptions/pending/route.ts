import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * GET /api/prescriptions/pending
 *
 * Queue FIFO des ordonnances uploadees en attente de recuperation par
 * AI2Xplore (statut UPLOADED, ackedAt IS NULL). Meme pattern que
 * /api/rdv/pending-events.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Query :
 *   externalCenterCode : requis, code unique ou CSV (ex: "N01,N02")
 *   limit             : optionnel, defaut 50, max 100
 *
 * Reponse 200 :
 *   {
 *     externalCenterCode: string | string[],
 *     items: [
 *       {
 *         id, rdvId, externalCenterCode, examType,
 *         uploadedAt, fileSize, fileSha256
 *       }
 *     ]
 *   }
 *
 * Aucune PII patient renvoyee (pas de phone/nom/prenom). AI2Xplore matche
 * les rdvId contre son propre logiciel metier pour retrouver le patient.
 * L'audit trail (PrescriptionAccessLog) n'est PAS alimente sur cette route
 * pour eviter la pollution — les crons AI2Xplore polleront a intervalle
 * regulier (~5 min), un log par appel = 288 rows/jour/centre pour rien.
 * On log au download() ou l'accès aux données patient est effectif.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const codeParam = req.nextUrl.searchParams.get("externalCenterCode");
  if (!codeParam) {
    return NextResponse.json(
      { error: "externalCenterCode is required" },
      { status: 400 }
    );
  }
  const codes = Array.from(
    new Set(
      codeParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  );
  if (codes.length === 0) {
    return NextResponse.json(
      { error: "externalCenterCode is required" },
      { status: 400 }
    );
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const res = await db.query<{
    id: number;
    rdvId: string;
    externalCenterCode: string;
    examType: string | null;
    uploadedAt: Date;
    fileSize: number;
    fileSha256: string;
  }>(
    `
    SELECT "id", "rdvId", "externalCenterCode", "examType",
           "uploadedAt", "fileSize", "fileSha256"
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'UPLOADED'
       AND "ackedAt" IS NULL
       AND "uploadedAt" IS NOT NULL
     ORDER BY "uploadedAt" ASC
     LIMIT $2
    `,
    [codes, limit]
  );

  return NextResponse.json({
    externalCenterCode: codes.length === 1 ? codes[0] : codes,
    items: res.rows,
  });
}

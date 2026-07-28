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
 * Scoping — 2 modes, exclusifs ou combinables :
 *   - externalCenterCode : code centre (unique ou CSV, ex "N01,N02")
 *   - userProductId     : id UserProduct (resout tous les codes centres
 *     du produit via ExternalCenterMapping). Symmetrique avec
 *     /api/rdv/pending-events pour permettre a AI2Xplore d'avoir UNE
 *     SEULE config de scoping par instance (le userProductId).
 *
 * Au moins l'un des deux est requis. Si les deux sont fournis, on prend
 * l'INTERSECTION (uniquement les items qui matchent ET le filtre
 * externalCenterCode ET l'appartenance au userProductId — utile pour
 * verifier defensivement qu'un code appartient bien au produit demande).
 *
 * Query :
 *   externalCenterCode : optionnel si userProductId fourni
 *   userProductId      : optionnel si externalCenterCode fourni
 *   limit             : optionnel, defaut 50, max 100
 *
 * Reponse 200 :
 *   {
 *     externalCenterCode: string | string[] | null,   // null si scope par uPId seul
 *     userProductId: number | null,
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
 * On log au download() ou l'acces aux donnees patient est effectif.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  // ------- Parse des 2 filtres possibles -------
  const codeParam = req.nextUrl.searchParams.get("externalCenterCode");
  const codes = codeParam
    ? Array.from(
        new Set(
          codeParam
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        )
      )
    : [];

  const upParam = req.nextUrl.searchParams.get("userProductId");
  const userProductId = upParam ? parseInt(upParam, 10) : null;
  if (upParam !== null && (!Number.isFinite(userProductId) || userProductId === null)) {
    return NextResponse.json(
      { error: "Invalid userProductId (expected integer)" },
      { status: 400 }
    );
  }

  if (codes.length === 0 && userProductId === null) {
    return NextResponse.json(
      { error: "At least one of externalCenterCode or userProductId is required" },
      { status: 400 }
    );
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  // ------- Construction dynamique de la query selon les filtres -------
  //
  // Cas :
  //   externalCenterCode seul : filtre ANY($codes)
  //   userProductId seul      : filtre via JOIN ExternalCenterMapping
  //   Les deux                : INTERSECTION (JOIN + ANY)
  //
  // On stack les predicats dynamiquement pour ne pas dupliquer 3 queries.
  const filters: string[] = ['pu."status" = \'UPLOADED\'', 'pu."ackedAt" IS NULL', 'pu."uploadedAt" IS NOT NULL'];
  const params: any[] = [];
  let joinClause = "";

  if (userProductId !== null) {
    joinClause = `JOIN "ExternalCenterMapping" ecm ON ecm."externalCenterCode" = pu."externalCenterCode"`;
    params.push(userProductId);
    filters.push(`ecm."userProductId" = $${params.length}`);
  }

  if (codes.length > 0) {
    params.push(codes);
    filters.push(`pu."externalCenterCode" = ANY($${params.length}::text[])`);
  }

  params.push(limit);
  const limitParamIndex = params.length;

  const sql = `
    SELECT pu."id", pu."rdvId", pu."externalCenterCode", pu."examType",
           pu."uploadedAt", pu."fileSize", pu."fileSha256"
      FROM "PrescriptionUpload" pu
      ${joinClause}
     WHERE ${filters.join(" AND ")}
     ORDER BY pu."uploadedAt" ASC
     LIMIT $${limitParamIndex}
  `;

  const res = await db.query<{
    id: number;
    rdvId: string;
    externalCenterCode: string;
    examType: string | null;
    uploadedAt: Date;
    fileSize: number;
    fileSha256: string;
  }>(sql, params);

  return NextResponse.json({
    externalCenterCode:
      codes.length === 0 ? null : codes.length === 1 ? codes[0] : codes,
    userProductId,
    items: res.rows,
  });
}

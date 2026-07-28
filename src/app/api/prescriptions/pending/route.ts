import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/prescriptions/pending
 *
 * Queue FIFO des ordonnances uploadees en attente de recuperation par
 * AI2Xplore (statut UPLOADED, ackedAt IS NULL). Alignee sur le pattern
 * de /api/rdv/pending-events pour que la meme VM AI2Xplore multi-tenant
 * consomme les 2 endpoints identiquement.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Query params (au moins l'un des 2 filtres requis) :
 *   - externalCenterCode : filtre par code centre. Valeur unique ou CSV
 *     (ex: "N01,MEN,A04"). Filtre applique directement sur
 *     PrescriptionUpload.externalCenterCode.
 *   - userProductId : filtre par UserProduct dashboard. Valeur unique ou
 *     CSV (ex: "2,15,12"). Resolu vers la liste d'externalCenterCode
 *     via ExternalCenterMapping.
 *   - limit : 1..100 (defaut 50)
 *
 * Combiner les 2 filtres est autorise (intersection defensive).
 *
 * Reponse 200 :
 * {
 *   count: <items dans cette page>,
 *   total: <total en attente matching le filtre — permet a AI2Xplore de
 *          savoir s'il doit re-poller immediatement>,
 *   hasMore: <count < total>,
 *   items: [
 *     { id, rdvId, externalCenterCode, examType,
 *       uploadedAt, fileSize, fileSha256 }
 *   ]
 * }
 *
 * Ordre : uploadedAt ASC, id ASC (FIFO stricte, stable). Garantit qu'aucun
 * item ne peut etre "noye" sous des uploads plus recents meme si la file
 * depasse `limit`.
 *
 * Aucune PII patient (pas de phone/nom/prenom). AI2Xplore matche par rdvId
 * contre son logiciel metier. L'audit trail n'est PAS alimente sur cette
 * route (polling toutes les 5 min = trop verbeux). Log au download() ou
 * l'acces aux donnees patient est effectif.
 */
export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  // ---- Parsing des 2 filtres (chacun CSV) ----
  const externalCenterCodes = parseCsvParam(
    req.nextUrl.searchParams.get("externalCenterCode")
  );

  const userProductIdsRaw = parseCsvParam(
    req.nextUrl.searchParams.get("userProductId")
  );
  const userProductIds = userProductIdsRaw
    ? userProductIdsRaw
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : null;

  if (
    (!externalCenterCodes || externalCenterCodes.length === 0) &&
    (!userProductIds || userProductIds.length === 0)
  ) {
    return NextResponse.json(
      { error: "At least one of externalCenterCode or userProductId is required" },
      { status: 400 }
    );
  }

  // Resolution userProductId(s) → externalCenterCode(s) via ExternalCenterMapping.
  // Un userProductId peut avoir N externalCenterCode. On agrege puis on filtre.
  // Si la resolution retourne 0 code (userProductId invalide ou pas de mapping) :
  // reponse vide, comme pending-events.
  let resolvedCenterCodes: string[] | null = null;
  if (userProductIds && userProductIds.length > 0) {
    const mapRes = await db.query<{ externalCenterCode: string }>(
      `SELECT DISTINCT m."externalCenterCode"
         FROM "ExternalCenterMapping" m
         JOIN "UserProduct" up ON up."id" = m."userProductId"
        WHERE m."userProductId" = ANY($1::int[])
          AND up."removedAt" IS NULL`,
      [userProductIds]
    );
    resolvedCenterCodes = mapRes.rows.map((r) => r.externalCenterCode);
    if (resolvedCenterCodes.length === 0) {
      return NextResponse.json({
        count: 0,
        total: 0,
        hasMore: false,
        items: [],
      });
    }
  }

  // Construction dynamique du WHERE.
  const conditions: string[] = [
    `"status" = 'UPLOADED'`,
    `"ackedAt" IS NULL`,
    `"uploadedAt" IS NOT NULL`,
  ];
  const bindings: any[] = [];
  let idx = 1;

  if (externalCenterCodes && externalCenterCodes.length > 0) {
    conditions.push(`"externalCenterCode" = ANY($${idx}::text[])`);
    bindings.push(externalCenterCodes);
    idx++;
  }
  if (resolvedCenterCodes && resolvedCenterCodes.length > 0) {
    conditions.push(`"externalCenterCode" = ANY($${idx}::text[])`);
    bindings.push(resolvedCenterCodes);
    idx++;
  }

  const whereClause = conditions.join(" AND ");

  // 1) Total en attente matching le filtre
  const totalRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count"
       FROM "PrescriptionUpload"
      WHERE ${whereClause}`,
    bindings
  );
  const total = parseInt(totalRes.rows[0]?.count ?? "0", 10);

  // 2) Page d'items, FIFO stricte
  const itemsRes = await db.query<{
    id: number;
    rdvId: string;
    externalCenterCode: string;
    examType: string | null;
    uploadedAt: Date;
    fileSize: number;
    fileSha256: string;
  }>(
    `SELECT "id", "rdvId", "externalCenterCode", "examType",
            "uploadedAt", "fileSize", "fileSha256"
       FROM "PrescriptionUpload"
      WHERE ${whereClause}
      ORDER BY "uploadedAt" ASC, "id" ASC
      LIMIT $${idx}`,
    [...bindings, limit]
  );

  return NextResponse.json({
    count: itemsRes.rowCount ?? 0,
    total,
    hasMore: (itemsRes.rowCount ?? 0) < total,
    items: itemsRes.rows,
  });
}

/**
 * Parse un query param CSV : trim + drop empty + dedup. Retourne null si
 * absent/vide.
 */
function parseCsvParam(raw: string | null): string[] | null {
  if (!raw) return null;
  const arr = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  );
  return arr.length > 0 ? arr : null;
}

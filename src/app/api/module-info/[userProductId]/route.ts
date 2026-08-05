export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint PUBLIC consomme par la brique Azure Functions module_info
 * (chantier 2026-08-05, Contrat A).
 *
 *   GET /api/module-info/[userProductId]
 *
 * Auth : header X-Api-Key == process.env.MODULE_INFO_API_KEY
 *
 * GET conditionnel :
 *   Si If-None-Match: "<version>" == version courante -> 304 Not Modified
 *   Sinon 200 avec le JSON complet
 *
 * Reponse 200 (application/json, UTF-8) :
 * {
 *   "userproductID": "12",
 *   "site_code": "MEN",
 *   "version": "2026-08-05T10:22:31.123Z",
 *   "items": [
 *     { "id": "urgence-sans-rdv", "question": "...", "reponse": "...",
 *       "categorie": "Rendez-vous", "enabled": true },
 *     ...
 *   ]
 * }
 *
 * Headers :
 *   ETag: "<version>"
 *   Cache-Control: no-cache, must-revalidate
 *   Content-Type: application/json; charset=utf-8
 *
 * Codes d'erreur :
 *   401 : X-Api-Key manquant
 *   403 : X-Api-Key invalide
 *   404 : userProductId inconnu (aucun UserProduct correspondant)
 *   500 : erreur DB / config env manquante
 *
 * Choix design :
 *   - Items filtres cote back (enabled=true uniquement)
 *   - site_code = premier externalCenterCode de ExternalCenterMapping (si existe)
 *   - version = ISO 8601 UTC de UserProduct.moduleInfoVersion
 *   - ETag inclut les guillemets doubles (convention HTTP)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { userProductId: string } }
) {
  // 1. Auth API key
  const expectedKey = process.env.MODULE_INFO_API_KEY;
  if (!expectedKey) {
    console.error("[module-info GET public] MODULE_INFO_API_KEY non configure");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const providedKey = req.headers.get("x-api-key");
  if (!providedKey) {
    return NextResponse.json(
      { error: "Missing X-Api-Key header" },
      { status: 401 }
    );
  }
  if (providedKey !== expectedKey) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 403 }
    );
  }

  // 2. Parse userProductId
  const userProductId = parseInt(params.userProductId, 10);
  if (!Number.isFinite(userProductId) || userProductId <= 0) {
    return NextResponse.json(
      { error: "Invalid userProductId" },
      { status: 400 }
    );
  }

  // 3. Load version + site_code + items (parallel)
  const [userProduct, siteCodeRow] = await Promise.all([
    prisma.userProduct.findUnique({
      where: { id: userProductId },
      select: {
        id: true,
        moduleInfoVersion: true,
        removedAt: true,
      },
    }),
    prisma.$queryRaw<Array<{ externalCenterCode: string }>>`
      SELECT "externalCenterCode"
        FROM "ExternalCenterMapping"
       WHERE "userProductId" = ${userProductId}
       ORDER BY "id" ASC
       LIMIT 1
    `,
  ]);

  if (!userProduct || userProduct.removedAt !== null) {
    return NextResponse.json(
      { error: "UserProduct not found" },
      { status: 404 }
    );
  }

  const version = userProduct.moduleInfoVersion.toISOString();
  const etag = `"${version}"`;

  // 4. GET conditionnel : compare If-None-Match a l'ETag courant
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    // 304 : pas de body, mais garde le header ETag pour confirmer la version
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  }

  // 5. Load items actifs (order asc, createdAt asc pour stabilite)
  const items = await prisma.moduleInfoItem.findMany({
    where: { userProductId, enabled: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      question: true,
      reponse: true,
      categorie: true,
      enabled: true,
    },
  });

  const siteCode = siteCodeRow[0]?.externalCenterCode ?? null;

  const body = {
    userproductID: String(userProductId),
    site_code: siteCode,
    version,
    items,
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}

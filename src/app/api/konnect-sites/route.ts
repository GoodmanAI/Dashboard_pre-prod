export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";

/**
 * Sites d'un centre LyraeKonnect (lot C, second ticket).
 *
 * Le RIS distingue les lieux d'exercice par un `siteId` mais n'expose aucune
 * adresse. Le client la saisit ici, et le portail la dit au patient.
 *
 *  GET /api/konnect-sites?userProductId=NN   (session, ou clé API)
 *  PUT /api/konnect-sites?userProductId=NN   (session uniquement)
 *      body : { sites: [...] } — remplace l'ensemble
 *
 * Corps en snake_case, aligné sur `cabinet_site` de Konnect. ETag calculé comme
 * pour le catalogue : `count` + le plus récent `updatedAt`.
 */

type LigneSite = {
  siteId: string;
  libelle: string | null;
  codePostal: string;
  adresse: string | null;
};

async function estCentreKonnect(userProductId: number): Promise<boolean> {
  const res = await db.query<{ id: number }>(
    `SELECT up."id"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."id" = $1
        AND up."removedAt" IS NULL
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, PRODUITS.konnect.nom]
  );
  return (res.rowCount ?? 0) > 0;
}

function lireUserProductId(req: NextRequest): number | null {
  const brut = Number(new URL(req.url).searchParams.get("userProductId"));
  return !brut || Number.isNaN(brut) ? null : brut;
}

async function signature(userProductId: number): Promise<string> {
  const res = await db.query<{ n: string; dernier: Date | null }>(
    `SELECT COUNT(*)::text AS n, MAX("updatedAt") AS dernier
       FROM "KonnectSites" WHERE "userProductId" = $1`,
    [userProductId]
  );
  const { n, dernier } = res.rows[0];
  return `W/"${n}-${dernier ? dernier.getTime() : 0}"`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
    if (ownershipErr) return ownershipErr;
  }

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  const etag = await signature(userProductId);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const res = await db.query<LigneSite>(
    `SELECT "siteId", "libelle", "codePostal", "adresse"
       FROM "KonnectSites" WHERE "userProductId" = $1 ORDER BY "siteId" ASC`,
    [userProductId]
  );

  return NextResponse.json(
    {
      userProductId,
      count: res.rowCount ?? 0,
      sites: res.rows.map((s) => ({
        site_id: s.siteId,
        libelle: s.libelle,
        code_postal: s.codePostal,
        adresse: s.adresse,
      })),
    },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

/** 5 chiffres. Vide accepté : un site peut être décrit avant qu'on ait l'adresse. */
const CODE_POSTAL = /^[0-9]{5}$/;

function normaliser(brut: any, index: number): LigneSite {
  const siteId = typeof brut?.site_id === "string" ? brut.site_id.trim() : "";
  if (!siteId) {
    throw new Error(`Ligne ${index + 1} : l'identifiant du site est obligatoire.`);
  }
  const cp = typeof brut?.code_postal === "string" ? brut.code_postal.trim() : "";
  if (cp && !CODE_POSTAL.test(cp)) {
    throw new Error(
      `Site « ${siteId} » : le code postal doit comporter 5 chiffres. Il sert à rapprocher les patients du bon site.`
    );
  }
  const texte = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    siteId,
    libelle: texte(brut?.libelle),
    codePostal: cp,
    adresse: texte(brut?.adresse),
  };
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (auth.bot) {
    return NextResponse.json(
      { error: "Lecture seule pour un appel par clé API." },
      { status: 403 }
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.sites)) {
    return NextResponse.json({ error: "`sites` doit être un tableau." }, { status: 400 });
  }

  let lignes: LigneSite[];
  try {
    lignes = body.sites.map(normaliser);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ligne invalide" }, { status: 400 });
  }

  const vus = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.siteId)) {
      return NextResponse.json(
        { error: `L'identifiant de site « ${l.siteId} » apparaît plusieurs fois.` },
        { status: 400 }
      );
    }
    vus.add(l.siteId);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "KonnectSites" WHERE "userProductId" = $1`, [userProductId]);
    for (const l of lignes) {
      await client.query(
        `INSERT INTO "KonnectSites"
           ("userProductId", "siteId", "libelle", "codePostal", "adresse")
         VALUES ($1, $2, $3, $4, $5)`,
        [userProductId, l.siteId, l.libelle, l.codePostal, l.adresse]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  auditLog("data", "konnect-sites-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { sites: lignes.length },
  });

  return NextResponse.json(
    { userProductId, count: lignes.length },
    { headers: { ETag: await signature(userProductId) } }
  );
}

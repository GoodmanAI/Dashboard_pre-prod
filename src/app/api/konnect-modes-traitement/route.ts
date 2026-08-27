export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";

/**
 * Mode de traitement des demandes d'un centre LyraeKonnect (lot D, premier ticket).
 *
 * Le mode dit ce qui arrive à une demande : le patient réserve seul, il réserve et
 * le dossier part en relecture, ou aucun créneau ne lui est proposé et le cabinet
 * rappelle.
 *
 * Deux niveaux, l'examen précis primant sur la famille. La clé est une famille
 * (`irm`, `scanner`, `radio`, `echo`, `autre`) ou un code RIS, celui-là même que
 * porte `KonnectExamens.codeExamenClient` pour ce centre.
 *
 *  GET /api/konnect-modes-traitement?userProductId=NN   (session, ou clé API)
 *  PUT /api/konnect-modes-traitement?userProductId=NN   (session uniquement)
 *      body : { modes: [...] } — remplace l'ensemble
 *
 * Une table vide vaut « le patient réserve seul » partout. Ne jamais inverser ce
 * défaut : un centre mal configuré resterait ouvert plutôt que de bloquer en
 * silence tous ses rendez-vous.
 */

type LigneMode = {
  portee: string;
  cle: string;
  mode: string;
};

/** Miroir de `FamilleExamen` côté Konnect (`app/questionnaire/schema.py`). */
const FAMILLES = new Set(["irm", "scanner", "radio", "echo", "autre"]);

/** Miroir de `ModeTraitement` côté Konnect (`app/modes/schema.py`). */
const MODES = new Set(["autonome", "relecture", "orientation_directe"]);

const PORTEES = new Set(["famille", "examen"]);

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
       FROM "KonnectModesTraitement" WHERE "userProductId" = $1`,
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

  const res = await db.query<LigneMode>(
    `SELECT "portee", "cle", "mode"
       FROM "KonnectModesTraitement"
      WHERE "userProductId" = $1
      ORDER BY "portee" ASC, "cle" ASC`,
    [userProductId]
  );

  return NextResponse.json(
    { userProductId, count: res.rowCount ?? 0, modes: res.rows },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

/**
 * Normalise une ligne. Lève si elle est inexploitable.
 *
 * Une famille inconnue est refusée : Konnect ne saurait pas à quoi la rattacher, et
 * la surcharge serait silencieusement sans effet. Un code RIS, lui, est accepté tel
 * quel : c'est au mapping d'examens de dire s'il existe, pas à cette route.
 */
function normaliser(brut: any, index: number): LigneMode {
  const portee = typeof brut?.portee === "string" ? brut.portee.trim() : "";
  if (!PORTEES.has(portee)) {
    throw new Error(`Ligne ${index + 1} : la portée doit être « famille » ou « examen ».`);
  }
  const cle = typeof brut?.cle === "string" ? brut.cle.trim() : "";
  if (!cle) {
    throw new Error(`Ligne ${index + 1} : il manque la famille ou le code de l'examen.`);
  }
  if (portee === "famille" && !FAMILLES.has(cle)) {
    throw new Error(
      `La famille « ${cle} » n'existe pas. Les familles possibles sont : ${[...FAMILLES].join(", ")}.`
    );
  }
  const mode = typeof brut?.mode === "string" ? brut.mode.trim() : "";
  if (!MODES.has(mode)) {
    throw new Error(
      `Le mode « ${mode} » n'existe pas pour « ${cle} ». Les modes possibles sont : ${[...MODES].join(", ")}.`
    );
  }
  return { portee, cle, mode };
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
  if (!Array.isArray(body?.modes)) {
    return NextResponse.json({ error: "`modes` doit être un tableau." }, { status: 400 });
  }

  let lignes: LigneMode[];
  try {
    lignes = body.modes.map(normaliser);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ligne invalide" }, { status: 400 });
  }

  const vus = new Set<string>();
  for (const l of lignes) {
    const cle = `${l.portee}:${l.cle}`;
    if (vus.has(cle)) {
      return NextResponse.json(
        { error: `« ${l.cle} » est réglé deux fois. Gardez une seule ligne.` },
        { status: 400 }
      );
    }
    vus.add(cle);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "KonnectModesTraitement" WHERE "userProductId" = $1`, [
      userProductId,
    ]);
    for (const l of lignes) {
      await client.query(
        `INSERT INTO "KonnectModesTraitement" ("userProductId", "portee", "cle", "mode")
         VALUES ($1, $2, $3, $4)`,
        [userProductId, l.portee, l.cle, l.mode]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  auditLog("data", "konnect-modes-traitement-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: {
      total: lignes.length,
      familles: lignes.filter((l) => l.portee === "famille").length,
      examens: lignes.filter((l) => l.portee === "examen").length,
    },
  });

  return NextResponse.json(
    { userProductId, count: lignes.length },
    { headers: { ETag: await signature(userProductId) } }
  );
}

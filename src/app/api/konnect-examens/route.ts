export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";

/**
 * Catalogue d'examens LyraeKonnect d'un centre (lot C).
 *
 * Équivalent d'`ExamMapping` pour LyraeTalk : le client décrit ses examens ici, et
 * Konnect vient lire. Le Dashboard en est **propriétaire**.
 *
 *  GET /api/konnect-examens?userProductId=NN   (session, ou clé API)
 *      → 200 { userProductId, count, examens: [...] } + ETag
 *      → 304 si `If-None-Match` correspond
 *  PUT /api/konnect-examens?userProductId=NN   (session uniquement)
 *      body : { examens: [...] } — remplace l'ensemble du catalogue
 *
 * **Pourquoi le PUT remplace tout plutôt que de modifier ligne à ligne.** Le catalogue
 * est édité comme un tableau : on ajoute, on renomme, on désactive, on supprime, puis
 * on enregistre. Une API ligne à ligne obligerait l'écran à suivre les suppressions et
 * à émettre trois verbes différents ; un remplacement atomique évite les états
 * intermédiaires incohérents — un examen ne disparaît jamais « à moitié ».
 *
 * **Le corps de réponse est en snake_case**, aligné sur `ExamenOut` de Konnect
 * (`backend/app/cabinet/api.py`), pour qu'il le consomme sans traduction. Même
 * convention que `konnect-configuration` : la frontière camelCase ↔ snake_case est
 * ici, et nulle part ailleurs.
 *
 * **ETag calculé, non stocké** : `count` + le plus récent `updatedAt`. Une
 * modification déplace `updatedAt` ; une suppression change `count`. Pas de colonne
 * de version à maintenir, et le catalogue — qui peut compter des centaines de
 * lignes — ne transite que lorsqu'il a réellement changé.
 *
 * Route à déclarer dans `PUBLIC_API_PATTERNS` : l'appel de Konnect n'a pas de session.
 */

type LigneExamen = {
  examenCode: string;
  typeCode: string | null;
  libelle: string;
  ordoOblig: boolean;
  examenInjecte: boolean;
  actif: boolean;
  listeAttenteActive: boolean;
  source: string;
};

/** Le centre existe-t-il, est-il actif, et porte-t-il bien LyraeKonnect ? */
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

/**
 * Signature du catalogue. `count` seul ne suffit pas (renommer un examen ne le change
 * pas), `max(updatedAt)` seul non plus (supprimer une ligne ne le change pas). Les
 * deux ensemble couvrent les trois mutations possibles.
 */
async function signature(userProductId: number): Promise<string> {
  const res = await db.query<{ n: string; dernier: Date | null }>(
    `SELECT COUNT(*)::text AS n, MAX("updatedAt") AS dernier
       FROM "KonnectExamens" WHERE "userProductId" = $1`,
    [userProductId]
  );
  const { n, dernier } = res.rows[0];
  return `W/"${n}-${dernier ? dernier.getTime() : 0}"`;
}

/** Traduit vers le vocabulaire de Konnect. Renommer une clé le casse en silence. */
function versPayloadKonnect(l: LigneExamen) {
  return {
    examen_code: l.examenCode,
    type_code: l.typeCode,
    libelle: l.libelle,
    ordo_oblig: l.ordoOblig,
    examen_injecte: l.examenInjecte,
    actif: l.actif,
    liste_attente_active: l.listeAttenteActive,
    source: l.source,
  };
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

  const res = await db.query<LigneExamen>(
    `SELECT "examenCode", "typeCode", "libelle", "ordoOblig", "examenInjecte",
            "actif", "listeAttenteActive", "source"
       FROM "KonnectExamens"
      WHERE "userProductId" = $1
      ORDER BY "libelle" ASC`,
    [userProductId]
  );

  // Catalogue vide = centre pas encore paramétré. On répond 200 avec une liste vide,
  // jamais 404 : Konnect doit pouvoir distinguer « rien à proposer » d'une erreur, et
  // surtout ne pas vider son cache local sur une panne.
  return NextResponse.json(
    {
      userProductId,
      count: res.rowCount ?? 0,
      examens: res.rows.map(versPayloadKonnect),
    },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

/** Normalise une ligne reçue du formulaire. Lève si elle est inexploitable. */
function normaliser(brut: any, index: number): LigneExamen {
  const code = typeof brut?.examen_code === "string" ? brut.examen_code.trim() : "";
  if (!code) {
    throw new Error(`Ligne ${index + 1} : le code d'examen est obligatoire.`);
  }
  const libelle = typeof brut?.libelle === "string" ? brut.libelle.trim() : "";
  if (!libelle) {
    // Le libellé est ce que voit le patient. Une ligne sans libellé afficherait un
    // vide dans l'entonnoir, ce qui est pire qu'un examen absent.
    throw new Error(`Ligne ${index + 1} (${code}) : le libellé est obligatoire.`);
  }
  const typeCode = typeof brut?.type_code === "string" ? brut.type_code.trim() : "";
  const source = brut?.source === "ris" ? "ris" : "manuel";

  return {
    examenCode: code,
    typeCode: typeCode || null,
    libelle,
    ordoOblig: brut?.ordo_oblig === true,
    examenInjecte: brut?.examen_injecte === true,
    actif: brut?.actif !== false, // défaut true
    listeAttenteActive: brut?.liste_attente_active === true,
    source,
  };
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  // Écriture réservée à une session : le catalogue se pilote depuis le Dashboard.
  // Le push de pré-remplissage depuis Konnect fera l'objet d'une route dédiée, au
  // périmètre étroit — pas d'un assouplissement de celle-ci.
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

  if (!Array.isArray(body?.examens)) {
    return NextResponse.json({ error: "`examens` doit être un tableau." }, { status: 400 });
  }

  let lignes: LigneExamen[];
  try {
    lignes = body.examens.map(normaliser);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ligne invalide" }, { status: 400 });
  }

  // Un même code deux fois ferait échouer l'INSERT sur la contrainte d'unicité, avec
  // une erreur Postgres illisible pour l'utilisateur. On le dit clairement.
  const vus = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.examenCode)) {
      return NextResponse.json(
        { error: `Le code d'examen « ${l.examenCode} » apparaît plusieurs fois.` },
        { status: 400 }
      );
    }
    vus.add(l.examenCode);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Remplacement atomique : le catalogue n'est jamais partiellement écrit, et un
    // examen retiré de l'écran disparaît réellement.
    await client.query(`DELETE FROM "KonnectExamens" WHERE "userProductId" = $1`, [
      userProductId,
    ]);
    for (const l of lignes) {
      await client.query(
        `INSERT INTO "KonnectExamens"
           ("userProductId", "examenCode", "typeCode", "libelle", "ordoOblig",
            "examenInjecte", "actif", "listeAttenteActive", "source")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userProductId,
          l.examenCode,
          l.typeCode,
          l.libelle,
          l.ordoOblig,
          l.examenInjecte,
          l.actif,
          l.listeAttenteActive,
          l.source,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  auditLog("data", "konnect-examens-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { examens: lignes.length },
  });

  return NextResponse.json(
    { userProductId, count: lignes.length },
    { headers: { ETag: await signature(userProductId) } }
  );
}

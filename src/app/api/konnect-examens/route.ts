export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";
import { amorcerMapping } from "@/lib/referentielExamens";

/**
 * Mapping d'examens LyraeKonnect d'un centre (lot C).
 *
 * **Même modèle que LyraeTalk** : le référentiel NEURACORP est pré-rempli, le client
 * ne remplit que les colonnes de SON RIS en face. Un nouveau centre arrive donc avec
 * toutes les lignes déjà là, à compléter — jamais sur une page blanche.
 *
 * Les deux mappings restent **séparés**, un par produit : même RIS et mêmes codes,
 * mais Konnect porte trois réglages que le robot vocal ignore (ordonnance obligatoire,
 * injection, liste d'attente), et chaque produit a son écran.
 *
 *  GET /api/konnect-examens?userProductId=NN
 *      · session → le **mapping complet** (référentiel + saisie), pour l'écran.
 *        Jamais enregistré : si rien n'est stocké, on renvoie le référentiel avec les
 *        colonnes client vides.
 *      · clé API → le **catalogue effectif** en snake_case, pour Konnect : seulement
 *        les lignes pratiquées ET dont le code RIS est renseigné. Konnect n'a que
 *        faire des lignes non attribuées.
 *      → ETag dans les deux cas
 *  PUT /api/konnect-examens?userProductId=NN   (session uniquement)
 *      body : { examens: [...] } — remplace l'ensemble du mapping
 *
 * Cette double forme suit `/api/configuration/get/mapping` de LyraeTalk, qui sert lui
 * aussi l'écran et le robot depuis une seule route.
 */

type LigneMapping = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

const COLONNES = `"codeExamen", "typeExamen", "libelle", "codeExamenClient",
                  "codeExamenInjection", "typeExamenClient", "libelleClient",
                  "performed", "ordoOblig", "examenInjecte", "listeAttenteActive"`;

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

/** `count` + le plus récent `updatedAt` : couvre ajout, modification et suppression. */
async function signature(userProductId: number): Promise<string> {
  const res = await db.query<{ n: string; dernier: Date | null }>(
    `SELECT COUNT(*)::text AS n, MAX("updatedAt") AS dernier
       FROM "KonnectExamens" WHERE "userProductId" = $1`,
    [userProductId]
  );
  const { n, dernier } = res.rows[0];
  return `W/"${n}-${dernier ? dernier.getTime() : 0}"`;
}

/**
 * Ce que Konnect consomme : le catalogue **effectif**, dans son vocabulaire.
 *
 * Une ligne non pratiquée, ou sans code RIS, n'est pas un examen réservable — la
 * transmettre encombrerait le portail de lignes inutilisables. Le libellé client
 * prime, avec repli sur le libellé NEURACORP : un centre qui n'a pas renommé
 * l'examen affiche notre libellé plutôt qu'un vide.
 */
function versCatalogueKonnect(lignes: LigneMapping[]) {
  return lignes
    .filter((l) => l.performed && l.codeExamenClient.trim())
    .map((l) => ({
      examen_code: l.codeExamenClient.trim(),
      // Le code de NOTRE referentiel. Konnect s'en sert pour retrouver l'examen
      // pivot correspondant : `referentiel_pivot_examens.code_pivot` EST ce code
      // (le pivot est genere depuis le meme classeur NEURACORP). C'est ce qui lui
      // permet d'alimenter son mapping d'entonnoir sans que le Dashboard ait a
      // connaitre ses UUID.
      code_pivot: l.codeExamen,
      code_ris_injection: l.codeExamenInjection.trim() || null,
      type_code: l.typeExamenClient.trim() || l.typeExamen || null,
      libelle: l.libelleClient.trim() || l.libelle || l.codeExamenClient.trim(),
      ordo_oblig: l.ordoOblig,
      examen_injecte: l.examenInjecte,
      // `performed` a déjà filtré : tout ce qui sort d'ici est actif.
      actif: true,
      liste_attente_active: l.listeAttenteActive,
      source: "manuel",
    }));
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

  const res = await db.query<LigneMapping>(
    `SELECT ${COLONNES} FROM "KonnectExamens"
      WHERE "userProductId" = $1
      ORDER BY "typeExamen" NULLS LAST, "libelle" ASC`,
    [userProductId]
  );

  // --- Voie de Konnect : le catalogue effectif ---
  if (auth.bot) {
    const catalogue = versCatalogueKonnect(res.rows);
    return NextResponse.json(
      { userProductId, count: catalogue.length, examens: catalogue },
      { headers: { ETag: etag, "Cache-Control": "no-cache" } }
    );
  }

  // --- Voie de l'écran : le mapping complet ---
  // Rien d'enregistré → on amorce. D'abord sur le mapping LyraeTalk du même client
  // (même RIS, mêmes codes : le travail d'attribution est déjà fait), sinon sur le
  // référentiel NEURACORP. C'est ce qui évite la page blanche à l'ouverture d'un
  // nouveau centre — et, quand le client a déjà Talk, lui évite de tout ressaisir.
  if ((res.rowCount ?? 0) === 0) {
    const amorce = await amorcerMapping(userProductId);
    return NextResponse.json(
      {
        userProductId,
        amorce: true,
        source: amorce.source,
        motif: amorce.motif,
        examens: amorce.lignes,
      },
      { headers: { ETag: etag } }
    );
  }

  return NextResponse.json(
    { userProductId, amorce: false, source: "enregistre", examens: res.rows },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

/** Normalise une ligne du formulaire. Lève si elle est inexploitable. */
function normaliser(brut: any, index: number): LigneMapping {
  const code = typeof brut?.codeExamen === "string" ? brut.codeExamen.trim() : "";
  if (!code) {
    // Le code NEURACORP est la clé du mapping : sans lui la ligne ne désigne rien.
    throw new Error(`Ligne ${index + 1} : code NEURACORP manquant.`);
  }
  const texte = (v: any) => (typeof v === "string" ? v.trim() : "");
  return {
    codeExamen: code,
    typeExamen: texte(brut?.typeExamen) || null,
    libelle: texte(brut?.libelle) || null,
    codeExamenClient: texte(brut?.codeExamenClient),
    codeExamenInjection: texte(brut?.codeExamenInjection),
    typeExamenClient: texte(brut?.typeExamenClient),
    libelleClient: texte(brut?.libelleClient),
    performed: brut?.performed !== false,
    ordoOblig: brut?.ordoOblig === true,
    examenInjecte: brut?.examenInjecte === true,
    listeAttenteActive: brut?.listeAttenteActive === true,
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
  if (!Array.isArray(body?.examens)) {
    return NextResponse.json({ error: "`examens` doit être un tableau." }, { status: 400 });
  }

  let lignes: LigneMapping[];
  try {
    lignes = body.examens.map(normaliser);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ligne invalide" }, { status: 400 });
  }

  const vus = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.codeExamen)) {
      return NextResponse.json(
        { error: `Le code NEURACORP « ${l.codeExamen} » apparaît plusieurs fois.` },
        { status: 400 }
      );
    }
    vus.add(l.codeExamen);
  }

  // Deux lignes ne peuvent pas viser le même code RIS : Konnect ne saurait pas
  // laquelle appliquer, et la réservation deviendrait imprévisible.
  const codesRis = new Set<string>();
  for (const l of lignes) {
    const c = l.codeExamenClient.trim();
    if (!c || !l.performed) continue;
    if (codesRis.has(c)) {
      return NextResponse.json(
        { error: `Le code RIS « ${c} » est attribué à deux examens différents.` },
        { status: 400 }
      );
    }
    codesRis.add(c);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "KonnectExamens" WHERE "userProductId" = $1`, [
      userProductId,
    ]);
    for (const l of lignes) {
      await client.query(
        `INSERT INTO "KonnectExamens"
           ("userProductId", "codeExamen", "typeExamen", "libelle", "codeExamenClient",
            "codeExamenInjection", "typeExamenClient", "libelleClient", "performed",
            "ordoOblig", "examenInjecte", "listeAttenteActive")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          userProductId,
          l.codeExamen,
          l.typeExamen,
          l.libelle,
          l.codeExamenClient,
          l.codeExamenInjection,
          l.typeExamenClient,
          l.libelleClient,
          l.performed,
          l.ordoOblig,
          l.examenInjecte,
          l.listeAttenteActive,
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
    metadata: {
      lignes: lignes.length,
      attribues: lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
    },
  });

  return NextResponse.json(
    {
      userProductId,
      lignes: lignes.length,
      attribues: lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
    },
    { headers: { ETag: await signature(userProductId) } }
  );
}

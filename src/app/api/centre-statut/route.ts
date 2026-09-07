export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { NOMS_PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";
import {
  estStatut,
  statutDepuisBase,
  STATUT_DEFAUT,
  type StatutCentre,
} from "@/lib/centreStatut";

/**
 * Classement des centres par statut de cycle de vie (admin uniquement).
 *
 * Administre la table `CentreStatut`, créée par
 * `prisma/migrations/manual/2026_09_02_add_centre_statut.sql`. Table hors
 * `schema.prisma`, donc pool `pg` et requêtes paramétrées.
 *
 * Le statut décide de ce que les écrans AFFICHENT, jamais de ce que les briques
 * FONT : ni LyraeTalk ni Konnect ne lisent cette table. Elle n'a donc aucune
 * surface machine-à-machine et ne doit pas rejoindre `PUBLIC_API_PATTERNS` de
 * `src/middleware.ts`.
 *
 *  GET /api/centre-statut
 *    → tous les centres actifs des deux produits, avec leur statut. Un centre
 *      sans ligne remonte avec le statut par défaut (`integration`), pas absent :
 *      la page de parc doit lister ce qui n'a jamais été classé, c'est même son
 *      premier usage.
 *    → { rows: [{ userProductId, userId, clientNom, produit, statut, depuis,
 *                 note, classe }] }
 *
 *  PUT /api/centre-statut
 *    body : { userProductId: number, statut: StatutCentre, note?: string|null }
 *    → classe le centre. UPSERT : premier classement et changement passent par
 *      le même appel.
 *    → `depuis` n'est redaté QUE si le statut change vraiment. Corriger une
 *      faute de frappe dans la note ne doit pas faire croire que le centre a
 *      rebasculé aujourd'hui.
 */

type LigneParc = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  produitNom: string;
  statut: string | null;
  depuis: string | null;
  note: string | null;
  /** false = aucune ligne en base, le centre n'a jamais été classé. */
  classe: boolean;
};

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const res = await db.query<LigneParc>(
    `
    SELECT up."id"        AS "userProductId",
           u."id"         AS "userId",
           u."name"       AS "clientNom",
           u."email"      AS "clientEmail",
           p."name"       AS "produitNom",
           cs."statut"    AS "statut",
           cs."depuis"    AS "depuis",
           cs."note"      AS "note",
           (cs."userProductId" IS NOT NULL) AS "classe"
      FROM "UserProduct" up
      JOIN "User"    u ON u."id" = up."userId"
      JOIN "Product" p ON p."id" = up."productId"
      LEFT JOIN "CentreStatut" cs ON cs."userProductId" = up."id"
     WHERE up."removedAt" IS NULL
       AND p."name" = ANY($1::text[])
     ORDER BY u."name" ASC NULLS LAST, p."name" ASC
    `,
    [NOMS_PRODUITS]
  );

  // Le produit est traduit en slug ici, et non côté écran : `Product.name` est
  // une chaîne en base dont le renommage casse l'application en silence, et
  // `produitDepuisNom` est le seul endroit qui la connaît.
  const rows = res.rows.map((r) => ({
    userProductId: r.userProductId,
    userId: r.userId,
    clientNom: r.clientNom,
    clientEmail: r.clientEmail,
    produit: (produitDepuisNom(r.produitNom)?.slug ?? null) as SlugProduit | null,
    produitNom: r.produitNom,
    statut: statutDepuisBase(r.statut),
    depuis: r.depuis,
    note: r.note,
    classe: r.classe,
  }));

  return NextResponse.json({ count: rows.length, rows });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const userProductId = Number(body?.userProductId);
  if (!Number.isInteger(userProductId) || userProductId <= 0) {
    return NextResponse.json({ error: "userProductId manquant ou invalide." }, { status: 400 });
  }

  if (!estStatut(body?.statut)) {
    return NextResponse.json(
      { error: "Statut inconnu. Attendu : integration, production ou arrete." },
      { status: 400 }
    );
  }
  const statut: StatutCentre = body.statut;

  // Note absente = inchangée ; note à null ou vide = effacée. Les deux cas sont
  // distincts et l'écran a besoin des deux.
  const noteFournie = Object.prototype.hasOwnProperty.call(body, "note");
  const note: string | null =
    noteFournie && typeof body.note === "string" && body.note.trim() !== ""
      ? body.note.trim()
      : null;

  // Le centre existe-t-il, et n'est-il pas désaffilié ? Sans ce contrôle, la
  // clé étrangère renverrait une 23503 Postgres illisible pour l'utilisateur.
  const centre = await db.query<{ statut: string | null }>(
    `
    SELECT cs."statut"
      FROM "UserProduct" up
      LEFT JOIN "CentreStatut" cs ON cs."userProductId" = up."id"
     WHERE up."id" = $1
       AND up."removedAt" IS NULL
     LIMIT 1
    `,
    [userProductId]
  );

  if ((centre.rowCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "Ce centre n'existe pas ou n'est plus rattaché à ce produit." },
      { status: 404 }
    );
  }

  const statutActuel = statutDepuisBase(centre.rows[0].statut);
  const aChange = statutActuel !== statut;

  // `depuis` ne bouge que si le statut change réellement. Un centre sans ligne
  // est considéré comme étant à STATUT_DEFAUT : le classer explicitement en
  // intégration n'est donc pas un changement, et ne redate rien.
  await db.query(
    `
    INSERT INTO "CentreStatut" ("userProductId", "statut", "note", "majPar")
    VALUES ($1, $2, $3, $4)
    ON CONFLICT ("userProductId") DO UPDATE
       SET "statut"    = EXCLUDED."statut",
           "note"      = CASE WHEN $5 THEN EXCLUDED."note" ELSE "CentreStatut"."note" END,
           "majPar"    = EXCLUDED."majPar",
           "depuis"    = CASE WHEN "CentreStatut"."statut" <> EXCLUDED."statut"
                              THEN NOW() ELSE "CentreStatut"."depuis" END,
           "updatedAt" = NOW()
    `,
    [userProductId, statut, note, auth.session.user.id, noteFournie]
  );

  auditLog("account", "centre-statut-set", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { statutPrecedent: statutActuel, statut, aChange },
  });

  return NextResponse.json({ userProductId, statut, statutPrecedent: statutActuel, aChange });
}

/**
 * Retirer le classement d'un centre le fait retomber sur `integration`, donc au
 * silence. Utile pour annuler une mise en production faite par erreur sans
 * laisser une ligne qui prétend le contraire.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const userProductId = Number(new URL(req.url).searchParams.get("userProductId"));
  if (!Number.isInteger(userProductId) || userProductId <= 0) {
    return NextResponse.json({ error: "userProductId manquant ou invalide." }, { status: 400 });
  }

  const res = await db.query<{ statut: string }>(
    `DELETE FROM "CentreStatut" WHERE "userProductId" = $1 RETURNING "statut"`,
    [userProductId]
  );

  if ((res.rowCount ?? 0) > 0) {
    auditLog("account", "centre-statut-delete", {
      actor: {
        id: auth.session.user.id,
        email: auth.session.user.email ?? null,
        role: auth.session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "userProduct", id: userProductId },
      metadata: { statutPrecedent: res.rows[0].statut },
    });
  }

  return NextResponse.json({ userProductId, statut: STATUT_DEFAUT });
}

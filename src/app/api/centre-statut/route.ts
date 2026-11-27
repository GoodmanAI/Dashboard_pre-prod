export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { NOMS_PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";
import { statutDepuisBase } from "@/lib/centreStatut";

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
 *    → 410 depuis le 27/11/2026 : Pilot écrit le statut (voir plus bas).
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

/**
 * Le statut d'un centre se règle dans Pilot depuis le 27/11/2026 (décision d'Enzo, plan
 * lyrae/plans/2026-11-separation-dashboard-pilot.md) : la case « Passage en production »
 * du centre et l'étape de la fiche le posent (`src/pilot/lib/centres/statutDashboard.ts`).
 * L'écriture d'ici est refusée, et le retrait du classement (`DELETE`) n'existe plus.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;
  return NextResponse.json(
    { error: "Le statut d'un centre se règle dans Pilot : page Intégrations, case « Mise en service déclarée »." },
    { status: 410 }
  );
}

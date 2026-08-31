export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, assertUserAccess } from "@/lib/auth-helpers";
import { produitDepuisNom, SlugProduit } from "@/lib/produits";

/**
 * Les produits d'un client, avec le `userProductId` de chacun (lot U1).
 *
 * POURQUOI CETTE ROUTE EXISTE. Les URL des écrans portent désormais le client
 * (`/client/c/8/konnect/...`) et non plus le produit. Mais toutes les routes API
 * attendent un `userProductId`, et c'est délibéré : c'est une clé d'interface
 * documentée (`CONTRACT.md` §5 et suivants), consommée par LyraeTalk et par
 * AI2Xplore. La changer casserait les deux briques voisines.
 *
 * Il faut donc un pont entre les deux, et un seul. C'est celui-ci : le hook
 * `useCentreProduit` l'appelle, et aucune page ne résout un `userProductId`
 * autrement.
 *
 * ELLE SERT LES DEUX RÔLES, admin et client, ce qui n'est pas une facilité mais le
 * fond du sujet. Le pendant `/api/admin/produits-du-centre` répond à la même
 * question par l'autre bout (depuis un `userProductId`, trouver les frères) et
 * reste réservé aux admins, parce qu'il part d'un identifiant que le client ne
 * connaît pas forcément comme sien. Ici on part du `userId`, que `assertUserAccess`
 * sait exactement qui a le droit de lire : soi-même, un compte qu'on gère, son
 * compte parent, ou tout le monde si on est admin.
 *
 * GET /api/centre/{userId}/produits
 */

type Ligne = { userProductId: number; nom: string; removedAt: Date | null };

export type ProduitDuCentre = {
  slug: SlugProduit;
  libelle: string;
  userProductId: number;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userId = Number(params.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const accesErr = await assertUserAccess(auth.session, userId);
  if (accesErr) return accesErr;

  const res = await db.query<Ligne>(
    `SELECT up."id"        AS "userProductId",
            p."name"       AS "nom",
            up."removedAt" AS "removedAt"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."userId" = $1
      ORDER BY p."name" ASC`,
    [userId]
  );

  const produits: ProduitDuCentre[] = res.rows.flatMap((l) => {
    const produit = produitDepuisNom(l.nom);
    // Un produit hors référentiel (LyraeExplain, retiré le 24/08/2026, dont les
    // lignes restent en base) ou une affiliation retirée n'ont pas d'écran : les
    // laisser passer donnerait un onglet qui mène à une page vide.
    if (!produit || l.removedAt) return [];
    return [{ slug: produit.slug, libelle: produit.libelle, userProductId: l.userProductId }];
  });

  return NextResponse.json(
    { userId, produits },
    { headers: { "Cache-Control": "no-cache" } }
  );
}

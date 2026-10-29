export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserAccess } from "@/lib/auth-helpers";
import { produitsDuCentre } from "@/lib/produitsDuCentre";

export type { ProduitDuCentre } from "@/lib/produitsDuCentre";

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

  // Les sous-comptes héritent des affiliations de leur parent : voir `produitsDuCentre`.
  const produits = await produitsDuCentre(userId);

  return NextResponse.json(
    { userId, produits },
    { headers: { "Cache-Control": "no-cache" } }
  );
}

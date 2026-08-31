export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { produitDepuisNom } from "@/lib/produits";

/**
 * Les produits du client à qui appartient ce `userProductId`.
 *
 * POURQUOI CETTE ROUTE EXISTE. Un client qui a les deux produits a **deux**
 * `userProductId` distincts, un par produit. L'URL en porte un seul : depuis
 * `/client/services/talk/23`, rien ne permet de savoir que le même client est aussi
 * en Konnect sous l'identifiant 47.
 *
 * Le sélecteur de produit en a besoin pour basculer sans quitter le client. Un
 * admin qui regarde un centre doit pouvoir passer d'un produit à l'autre, ce qui
 * lui était impossible : les deux produits vivent sous deux chemins différents,
 * qu'il fallait connaître de mémoire.
 *
 * GET /api/admin/produits-du-centre?userProductId=NN → session admin uniquement.
 *
 * Réservée aux admins : un client, lui, connaît ses propres produits par
 * `/api/users/[userId]/products`, et n'a rien à savoir de ceux des autres.
 */

type Ligne = { userProductId: number; userId: number; nom: string; removedAt: Date | null };

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const brut = Number(new URL(req.url).searchParams.get("userProductId"));
  if (!brut || Number.isNaN(brut)) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  // Une seule requête : on remonte au client par le `userProductId` fourni, puis on
  // redescend sur toutes ses affiliations. `removedAt` est remonté plutôt que filtré
  // en SQL, pour que le repli côté appelant reste explicite.
  const res = await db.query<Ligne>(
    `SELECT frere."id"          AS "userProductId",
            frere."userId"      AS "userId",
            p."name"            AS "nom",
            frere."removedAt"   AS "removedAt"
       FROM "UserProduct" origine
       JOIN "UserProduct" frere ON frere."userId" = origine."userId"
       JOIN "Product" p ON p."id" = frere."productId"
      WHERE origine."id" = $1
      ORDER BY p."name" ASC`,
    [brut]
  );

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "Centre introuvable" }, { status: 404 });
  }

  const produits = res.rows.flatMap((l) => {
    const produit = produitDepuisNom(l.nom);
    // Un produit inconnu du référentiel (LyraeExplain, retiré) ou une affiliation
    // retirée n'ont rien à faire dans un sélecteur.
    if (!produit || l.removedAt) return [];
    return [{ slug: produit.slug, libelle: produit.libelle, userProductId: l.userProductId }];
  });

  return NextResponse.json(
    { userId: res.rows[0].userId, produits },
    { headers: { "Cache-Control": "no-cache" } }
  );
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { ORDRE_PRODUITS, produitDepuisNom } from "@/lib/produits";

/**
 * GET /api/admin/centres
 * -----------------------------------------------------------------------------
 * Renvoie la liste de tous les centres (utilisateurs CLIENT) avec leurs
 * UserProducts, au format attendu par CentreContext (`ManagedUser`).
 *
 * Accès : réservé aux comptes `role === "ADMIN"`.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "Access denied. Only admins can access this route." },
        { status: 403 }
      );
    }

    const centres = await prisma.user.findMany({
      where: { role: "CLIENT" },
      select: {
        id: true,
        name: true,
        email: true,
        centreRole: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        userProducts: {
          select: {
            id: true,
            assignedAt: true,
            product: { select: { id: true, name: true, description: true } },
            talkDetails: {
              select: {
                talkInfoValidated: true,
                talkLibelesValidated: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Tous les centres qui portent au moins un produit du catalogue, quel qu'il
    // soit. Avant, cette route ne gardait que ceux ayant LyraeTalk, et renvoyait
    // toujours le `userProductId` de Talk : un client uniquement LyraeKonnect
    // n'apparaissait nulle part pour un admin, et un client ayant les deux ne
    // pouvait pas être regardé côté Konnect.
    //
    // Le filtre passait par `name?.includes("Talk")`, une comparaison de nom de
    // produit en dur — précisément ce que `produits.ts` existe pour éviter :
    // renommer `Product.name` en base aurait vidé ce sélecteur sans la moindre
    // erreur de compilation.
    const enrichis = centres
      .map((c) => {
        const produits = c.userProducts.flatMap((up) => {
          const produit = produitDepuisNom(up.product?.name);
          // Affiliation retirée ou produit hors catalogue (LyraeExplain) : hors
          // sélecteur.
          if (!produit) return [];
          return [{ slug: produit.slug, libelle: produit.libelle, userProductId: up.id }];
        });
        produits.sort(
          (a, b) => ORDRE_PRODUITS.indexOf(a.slug) - ORDRE_PRODUITS.indexOf(b.slug)
        );
        return {
          ...c,
          // `produits` est la vraie réponse : un centre a N produits, et c'est à
          // l'appelant de choisir lequel il regarde.
          produits,
          // Conservé pour les écrans qui n'ont pas encore de notion de produit.
          // Vaut LyraeTalk quand il existe, sinon le premier du catalogue : ces
          // écrans sont ceux du robot vocal, et pointer ailleurs les casserait.
          userProductId:
            produits.find((p) => p.slug === "talk")?.userProductId ??
            produits[0]?.userProductId ??
            null,
        };
      })
      .filter((c) => c.produits.length > 0);

    return NextResponse.json(enrichis, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error("Error fetching admin centres:", err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

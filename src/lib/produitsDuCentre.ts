import { db } from "@/lib/db";
import { produitDepuisNom, SlugProduit } from "@/lib/produits";

/**
 * Les produits d'un client, avec le `userProductId` de chacun.
 *
 * Sortie de `GET /api/centre/{userId}/produits` le 28/10/2026 pour que la recherche
 * centrale (`/api/recherche`) résolve les produits exactement de la même façon : il
 * n'existe qu'un pont entre `userId` et `userProductId`, et c'est celui-ci. Le
 * contrôle d'accès reste à l'appelant (`assertUserAccess`).
 */

type Ligne = { userProductId: number; nom: string; removedAt: Date | null; propre: boolean };

export type ProduitDuCentre = {
  slug: SlugProduit;
  libelle: string;
  userProductId: number;
};

export async function produitsDuCentre(userId: number): Promise<ProduitDuCentre[]> {
  // UN SOUS-COMPTE N'A PAS DE `UserProduct` EN PROPRE, il herite de ceux de son
  // compte parent (chantier 3). L'ancienne route `/api/users/{id}/products` le
  // faisait deja ; le lot U1 a reecrit la resolution sans le reporter, et les
  // sous-comptes se sont retrouves devant « ce centre n'a pas le produit » sur
  // les 18 ecrans qui montent `useCentreProduit`.
  //
  // On demande donc les affiliations du compte ET celles de son manager, puis on
  // garde les siennes s'il en a. Passer par `managerId` plutot que par la presence
  // de `permissions` couvre aussi un sous-compte dont les permissions sont nulles,
  // que la regle historique laissait de cote.
  const res = await db.query<Ligne>(
    `SELECT up."id"        AS "userProductId",
            p."name"       AS "nom",
            up."removedAt" AS "removedAt",
            (up."userId" = $1) AS "propre"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."userId" = $1
         OR up."userId" = (SELECT u."managerId" FROM "User" u WHERE u."id" = $1)
      ORDER BY p."name" ASC`,
    [userId]
  );

  const propres = res.rows.filter((l) => l.propre);
  const lignes = propres.length > 0 ? propres : res.rows;

  return lignes.flatMap((l) => {
    const produit = produitDepuisNom(l.nom);
    // Un produit hors référentiel (LyraeExplain, retiré le 24/08/2026, dont les
    // lignes restent en base) ou une affiliation retirée n'ont pas d'écran : les
    // laisser passer donnerait un onglet qui mène à une page vide.
    if (!produit || l.removedAt) return [];
    return [{ slug: produit.slug, libelle: produit.libelle, userProductId: l.userProductId }];
  });
}

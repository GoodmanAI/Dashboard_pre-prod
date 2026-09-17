import { db } from "@/lib/db";
import { PRODUITS } from "@/lib/produits";

/**
 * Le produit qui PORTE les relances no-show d'un client (18/09/2026).
 * Plan : `lyrae/plans/2026-09-relances-no-show-unifiees.md`.
 *
 * POURQUOI UN PORTEUR. AI2Xplore relance tous les rendez-vous d'un centre, quel que soit le
 * canal de prise de rendez-vous, et retrouve le réglage par code site
 * (`ExternalCenterMapping`, unique au global) : un seul `UserProduct` porte donc la
 * configuration. Un client qui a LyraeTalk et Konnect a deux `UserProduct` sous le même
 * `User`. Pour que l'activation d'un côté soit celle de l'autre, les deux écrans lisent et
 * écrivent chez le porteur.
 *
 * LA RÈGLE, dans l'ordre :
 *   1. un produit du même client, LyraeTalk ou Konnect, qui a un code site rattaché
 *      (LyraeTalk d'abord) : c'est lui que les relances lisent ;
 *   2. sinon, le produit demandé.
 */
export async function porteurRelances(userProductId: number): Promise<number> {
  const res = await db.query<{ id: number }>(
    `
    SELECT up."id"
      FROM "UserProduct" demande
      JOIN "UserProduct" up
        ON up."userId" = demande."userId" AND up."removedAt" IS NULL
      JOIN "Product" p ON p."id" = up."productId"
     WHERE demande."id" = $1
       AND lower(p."name") IN (lower($2), lower($3))
       AND EXISTS (
             SELECT 1 FROM "ExternalCenterMapping" m WHERE m."userProductId" = up."id"
           )
     ORDER BY (lower(p."name") = lower($2)) DESC, up."id" ASC
     LIMIT 1
    `,
    [userProductId, PRODUITS.talk.nom, PRODUITS.konnect.nom]
  );
  return res.rows[0]?.id ?? userProductId;
}

/**
 * Un client Konnect sans code site rattaché : on rattache celui de son rattachement au
 * logiciel du centre (`konnect.ris-identite`), pour que les relances le trouvent.
 *
 * Ne fait rien si le produit a déjà un code, si le rattachement Konnect n'en porte pas, ou
 * si ce code est déjà rattaché ailleurs (il est unique) : les relances ne marcheront alors
 * pas pour ce client, et c'est au support de trancher. Renvoie vrai si un code est rattaché
 * au produit à la fin de l'appel.
 */
export async function rattacherCodeSiteKonnect(userProductId: number): Promise<boolean> {
  const existant = await db.query<{ id: number }>(
    `SELECT "id" FROM "ExternalCenterMapping" WHERE "userProductId" = $1 LIMIT 1`,
    [userProductId]
  );
  if ((existant.rowCount ?? 0) > 0) return true;

  const ris = await db.query<{ codeSite: string | null }>(
    `SELECT pc."valeur" ->> 'code_site' AS "codeSite"
       FROM "ProductConfig" pc
       JOIN "UserProduct" up ON up."id" = pc."userProductId"
       JOIN "Product" p ON p."id" = up."productId"
      WHERE pc."userProductId" = $1
        AND pc."domaine" = 'konnect.ris-identite'
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, PRODUITS.konnect.nom]
  );
  const code = (ris.rows[0]?.codeSite ?? "").trim();
  if (!code) return false;

  const ins = await db.query<{ id: number }>(
    `INSERT INTO "ExternalCenterMapping" ("userProductId", "externalCenterCode")
     SELECT $1, $2
      WHERE NOT EXISTS (
              SELECT 1 FROM "ExternalCenterMapping" WHERE "externalCenterCode" = $2
            )
     RETURNING "id"`,
    [userProductId, code]
  );
  return (ins.rowCount ?? 0) > 0;
}

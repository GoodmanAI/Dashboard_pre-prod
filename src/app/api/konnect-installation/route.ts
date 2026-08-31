export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";

/**
 * Où en est l'installation de chaque centre LyraeKonnect (lot G6).
 *
 * Installer un centre demande cinq gestes, dans cet ordre, et chacun conditionne
 * le suivant. Ils se faisaient jusqu'ici sur trois écrans différents, sans que
 * personne ne puisse dire d'un coup d'œil où en était un client donné. Cette route
 * répond à cette question, et à elle seule.
 *
 * **Le rattachement est devenu obligatoire** (lot G, 28/08/2026). La console
 * cabinet de Konnect ne règle plus la configuration : un centre non rattaché n'a
 * plus aucune interface de paramétrage. Ce qui était une commodité est désormais
 * un prérequis, et c'est pour ça que cet écran existe.
 *
 * GET /api/konnect-installation → session admin uniquement.
 *
 * Ce qu'on ne fait PAS ici : lire quoi que ce soit chez Konnect. Le Dashboard ne
 * peut pas l'appeler (il est derrière un VPN), et n'a pas à le faire. Toutes les
 * étapes ci-dessous se lisent dans les tables du Dashboard, parce que c'est lui qui
 * en est propriétaire.
 */

type LigneInstallation = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  tenantId: string | null;
  aDesParametres: boolean;
  examensAttribues: number;
  examensTotal: number;
  sites: number;
  telephoneSecretariat: string | null;
  /** Rattachement au logiciel du centre, domaine `konnect.ris-identite`. */
  risBaseUrl: string | null;
  risCodeSite: string | null;
};

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  // Une seule requête : chaque sous-requête compte ce qui a été saisi pour ce
  // centre. `LEFT JOIN` partout, un centre tout juste créé devant apparaître avec
  // des zéros plutôt que de disparaître de la liste.
  const res = await db.query<LigneInstallation>(
    `SELECT
       up."id"                                        AS "userProductId",
       up."userId"                                    AS "userId",
       u."name"                                       AS "clientNom",
       u."email"                                      AS "clientEmail",
       m."tenantId"                                   AS "tenantId",
       (s."userProductId" IS NOT NULL)                AS "aDesParametres",
       COALESCE(e."attribues", 0)::int                AS "examensAttribues",
       COALESCE(e."total", 0)::int                    AS "examensTotal",
       COALESCE(si."n", 0)::int                       AS "sites",
       s."telephoneSecretariat"                       AS "telephoneSecretariat",
       -- Le rattachement RIS vit dans le socle générique, pas dans une table à
       -- lui. L'extraction JSON renvoie NULL si la ligne ou la clé manque, ce qui
       -- est exactement l'état « pas encore rattaché ».
       ris."valeur" ->> 'base_url'                    AS "risBaseUrl",
       ris."valeur" ->> 'code_site'                   AS "risCodeSite"
     FROM "UserProduct" up
     JOIN "Product" p ON p."id" = up."productId"
     LEFT JOIN "User" u ON u."id" = up."userId"
     LEFT JOIN "KonnectTenantMapping" m ON m."userProductId" = up."id"
     LEFT JOIN "KonnectSettings" s ON s."userProductId" = up."id"
     LEFT JOIN (
       SELECT "userProductId",
              COUNT(*) AS "total",
              COUNT(*) FILTER (WHERE "performed" AND btrim("codeExamenClient") <> '') AS "attribues"
         FROM "KonnectExamens" GROUP BY "userProductId"
     ) e ON e."userProductId" = up."id"
     LEFT JOIN (
       SELECT "userProductId", COUNT(*) AS "n" FROM "KonnectSites" GROUP BY "userProductId"
     ) si ON si."userProductId" = up."id"
     LEFT JOIN "ProductConfig" ris
       ON ris."userProductId" = up."id" AND ris."domaine" = 'konnect.ris-identite'
     WHERE up."removedAt" IS NULL
       AND lower(p."name") = lower($1)
     ORDER BY u."name" ASC NULLS LAST, up."id" ASC`,
    [PRODUITS.konnect.nom]
  );

  return NextResponse.json(
    { count: res.rowCount ?? 0, centres: res.rows },
    { headers: { "Cache-Control": "no-cache" } }
  );
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";

/**
 * Où en est l'installation de chaque centre LyraeTalk (lot I2).
 *
 * Pendant de `/api/konnect-installation`, mais les deux produits ne s'installent
 * pas pareil et cette route ne cherche pas à les faire ressembler.
 *
 * **La différence qui compte : les codes centres.** Konnect rattache UN portail à un
 * compte, relation 1 ↔ 1. Talk accepte N codes centres pour un même compte, un
 * client pouvant exploiter plusieurs centres sous un seul contrat. La route renvoie
 * donc la liste, pas un booléen.
 *
 * `ExternalCenterMapping.externalCenterCode` est la clé de jointure avec AI2Xplore
 * (`CONTRACT.md` §5). Une faute de frappe n'y produit aucune erreur : les
 * rendez-vous n'arrivent simplement jamais. D'où l'affichage des codes en clair
 * plutôt qu'un simple compteur, pour qu'ils soient relisibles.
 *
 * GET /api/talk-installation → session admin uniquement.
 */

type LigneInstallation = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  codesCentres: string[];
  numeros: string[];
  aDesReglages: boolean;
  botName: string | null;
  examensAttribues: number;
  aSmsConfirmation: boolean;
  aDepotOrdonnances: boolean;
  faq: number;
};

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const res = await db.query<LigneInstallation>(
    `SELECT
       up."id"                                  AS "userProductId",
       up."userId"                              AS "userId",
       u."name"                                 AS "clientNom",
       u."email"                                AS "clientEmail",
       COALESCE(cc."codes", ARRAY[]::text[])    AS "codesCentres",
       COALESCE(nb."numeros", ARRAY[]::text[])  AS "numeros",
       (ts."userProductId" IS NOT NULL)         AS "aDesReglages",
       ts."botName"                             AS "botName",
       -- Le mapping d'examens vit dans un JSON, pas dans une table : on compte les
       -- entrees qui portent un code client, seules a rendre un examen reservable.
       COALESCE(ex."attribues", 0)::int         AS "examensAttribues",
       (sms."userProductId" IS NOT NULL)        AS "aSmsConfirmation",
       (po."userProductId" IS NOT NULL)         AS "aDepotOrdonnances",
       COALESCE(mi."n", 0)::int                 AS "faq"
     FROM "UserProduct" up
     JOIN "Product" p ON p."id" = up."productId"
     LEFT JOIN "User" u ON u."id" = up."userId"
     LEFT JOIN (
       SELECT "userProductId", array_agg("externalCenterCode" ORDER BY "externalCenterCode") AS "codes"
         FROM "ExternalCenterMapping" GROUP BY "userProductId"
     ) cc ON cc."userProductId" = up."id"
     LEFT JOIN (
       SELECT "userId", array_agg("number" ORDER BY "number") AS "numeros"
         FROM "UserNumber" WHERE "removedAt" IS NULL GROUP BY "userId"
     ) nb ON nb."userId" = up."userId"
     LEFT JOIN "TalkSettings" ts ON ts."userProductId" = up."id"
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS "attribues"
         FROM jsonb_array_elements(
                CASE jsonb_typeof(ts."exams") WHEN 'array' THEN ts."exams" ELSE '[]'::jsonb END
              ) AS e
        WHERE btrim(COALESCE(e ->> 'codeExamenClient', '')) <> ''
     ) ex ON true
     LEFT JOIN "SmsConfirmationConfig" sms ON sms."userProductId" = up."id"
     LEFT JOIN "PrescriptionConfig" po ON po."userProductId" = up."id"
     LEFT JOIN (
       SELECT "userProductId", COUNT(*) AS "n" FROM "ModuleInfoItem" GROUP BY "userProductId"
     ) mi ON mi."userProductId" = up."id"
     WHERE up."removedAt" IS NULL
       AND lower(p."name") = lower($1)
     ORDER BY u."name" ASC NULLS LAST, up."id" ASC`,
    [PRODUITS.talk.nom]
  );

  return NextResponse.json(
    { count: res.rowCount ?? 0, centres: res.rows },
    { headers: { "Cache-Control": "no-cache" } }
  );
}

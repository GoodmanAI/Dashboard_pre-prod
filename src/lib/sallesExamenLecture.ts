/**
 * Lecture en base des salles déclarées d'un centre (`talk.site.sallesParType`).
 *
 * Séparé de `sallesExamen.ts` parce que ce module-là est importé par les écrans : y
 * mettre le pool `pg` le ferait embarquer dans le navigateur.
 */

import { db } from "@/lib/db";
import { lireSallesParType, type SallesParType } from "@/lib/sallesExamen";

/** `{}` quand le centre n'a pas de `talk.site` ou n'y déclare aucune salle. */
export async function sallesDuCentre(userProductId: number): Promise<SallesParType> {
  const res = await db.query<{ salles: unknown }>(
    `SELECT "valeur"->'sallesParType' AS "salles" FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = 'talk.site' LIMIT 1`,
    [userProductId]
  );
  return lireSallesParType(res.rows[0]?.salles ?? null);
}

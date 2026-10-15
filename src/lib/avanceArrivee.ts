import { db } from "@/lib/db";
import { CLE_AVANCE, avanceDuType } from "@/lib/talkTextes";

/**
 * Minutes d'avance d'un type d'examen chez un centre (`talk.textes.avanceParExamen`,
 * 15/10/2026), 0 si rien n'est réglé ou si la lecture échoue : une page patient
 * affiche alors l'heure réelle plutôt que de tomber.
 */
export async function avanceDuCentre(
  externalCenterCode: string,
  examType: string | null,
): Promise<number> {
  if (!examType) return 0;
  try {
    const res = await db.query<{ avance: unknown }>(
      `SELECT pc."valeur" -> $2::text AS "avance"
         FROM "ExternalCenterMapping" m
         JOIN "ProductConfig" pc ON pc."userProductId" = m."userProductId"
        WHERE m."externalCenterCode" = $1 AND pc."domaine" = 'talk.textes'
        LIMIT 1`,
      [externalCenterCode, CLE_AVANCE],
    );
    return avanceDuType(res.rows[0]?.avance, examType);
  } catch {
    return 0;
  }
}

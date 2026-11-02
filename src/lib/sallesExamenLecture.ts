/**
 * Lecture en base des salles d'un centre pour Talk.
 *
 * Depuis le 02/11/2026 (plan `2026-11-salles-facturees-talk-konnect.md`), la source est
 * la table `Salle` du client, partagée avec Konnect, avec une case par produit
 * (`sallesFacturees.ts`). Tant que le client n'y a aucune salle (ou que la table
 * n'existe pas encore), on lit l'ancienne déclaration `talk.site.sallesParType` : rien
 * ne change pour un centre que l'admin n'a pas encore réglé.
 *
 * Séparé de `sallesExamen.ts` parce que ce module-là est importé par les écrans : y
 * mettre le pool `pg` le ferait embarquer dans le navigateur.
 */

import { db } from "@/lib/db";
import { lireSallesParType, type SallesParType } from "@/lib/sallesExamen";
import { sallesTalk, type SallesTalk } from "@/lib/sallesFacturees";
import { sallesDuUserProduct } from "@/lib/sallesFactureesLecture";

async function ancienneDeclaration(userProductId: number): Promise<SallesParType> {
  const res = await db.query<{ salles: unknown }>(
    `SELECT "valeur"->'sallesParType' AS "salles" FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = 'talk.site' LIMIT 1`,
    [userProductId]
  );
  return lireSallesParType(res.rows[0]?.salles ?? null);
}

/** Les salles de Talk pour ce centre, et si le filtre des salles payées s'applique. */
export async function sallesTalkDuCentre(userProductId: number): Promise<SallesTalk> {
  const lignes = await sallesDuUserProduct(userProductId);
  if (lignes && lignes.length > 0) return sallesTalk(lignes);
  return { sallesParType: await ancienneDeclaration(userProductId), actif: false };
}

/**
 * Les salles que le centre peut choisir, par type. `{}` quand il n'y en a aucune.
 * Talk actif : les seules salles payées.
 */
export async function sallesDuCentre(userProductId: number): Promise<SallesParType> {
  return (await sallesTalkDuCentre(userProductId)).sallesParType;
}

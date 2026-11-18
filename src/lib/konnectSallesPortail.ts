import { db } from "@/lib/db";
import {
  DOMAINE_SALLES_KONNECT,
  lireSallesKonnect,
  postesPourKonnect,
  typeSallesExamen,
  type SallesKonnect,
} from "@/lib/konnectSalles";
import { sallesKonnect } from "@/lib/sallesFacturees";
import {
  sallesDuUserProduct,
  versionSallesDuUserProduct,
} from "@/lib/sallesFactureesLecture";

/**
 * Les salles du portail et leur version (pour l'ETag). Lecture serveur, partagée par
 * le catalogue de Konnect (`/api/konnect-examens`) et par les ponts de Talk vers
 * Konnect (`rdvEnLigneLecture.ts`, 18/11/2026) : les deux doivent dire la même chose
 * d'un examen réservable en ligne.
 *
 * Depuis le 02/11/2026 (plan `2026-11-salles-facturees-talk-konnect`), la table
 * `Salle` du client, case Konnect. Tant que le client n'y a aucune salle (ou que la
 * table n'existe pas encore), l'ancien domaine `konnect.salles` : rien ne change pour un
 * centre pas encore réglé. La version de la table est préfixée `t` pour ne jamais
 * retomber sur une version de l'ancien domaine.
 */
export async function sallesDuPortail(
  userProductId: number
): Promise<{ config: SallesKonnect; version: number | string }> {
  const lignes = await sallesDuUserProduct(userProductId);
  if (lignes && lignes.length > 0) {
    return {
      config: sallesKonnect(lignes),
      version: `t${await versionSallesDuUserProduct(userProductId)}`,
    };
  }
  const res = await db.query<{ valeur: unknown; version: number }>(
    `SELECT "valeur", "version" FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = $2 LIMIT 1`,
    [userProductId, DOMAINE_SALLES_KONNECT]
  );
  return {
    config: lireSallesKonnect(res.rows[0]?.valeur ?? null),
    version: res.rows[0]?.version ?? 0,
  };
}

/**
 * Le chemin d'un examen dans le portail : réservable seul, avec ou sans file
 * d'attente quand il n'y a pas de créneau. Sans salle ouverte (`postes === null`),
 * l'examen passe au rappel. Seule règle, lue par Konnect et par Talk.
 */
export function cheminEnLigne(
  ligne: {
    typeExamen: string | null;
    typeExamenClient: string;
    postes: string[] | null;
    reservableEnLigne: boolean;
    fileAttente: boolean;
  },
  salles: SallesKonnect
): { postes: string[] | null; reservable: boolean; fileAttente: boolean } {
  const postes = postesPourKonnect(
    salles,
    typeSallesExamen(ligne.typeExamen, ligne.typeExamenClient),
    ligne.postes
  );
  const reservable = ligne.reservableEnLigne && postes !== null;
  return { postes, reservable, fileAttente: ligne.fileAttente && reservable };
}

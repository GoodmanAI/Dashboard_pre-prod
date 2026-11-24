import { Prisma } from "@prisma/client";

/**
 * Un instant passé à une requête brute, à comparer à une colonne de date.
 *
 * Les colonnes sont des horodatages sans fuseau, écrits en UTC par Prisma. Un
 * Date passé tel quel arrive en timestamptz : Postgres lirait alors la colonne
 * dans le fuseau de la session (Europe/Paris en local), à une ou deux heures
 * près. Les requêtes Prisma classiques n'ont pas ce décalage.
 */
export const instantSql = (instant: Date) => Prisma.sql`(${instant}::timestamptz AT TIME ZONE 'UTC')`;

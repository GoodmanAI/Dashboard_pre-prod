import type { CrmEtapeCommerciale } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { LIBELLES } from "@/pilot/lib/pipeline";

export function normaliserRequete(q: string): string {
  const propre = q.trim().replace(/\s+/g, " ");
  return propre.length >= 2 && propre.length <= 80 ? propre : "";
}
export type ResultatRecherche = { id: number; organisationId: number; libelle: string; secondaire: string };
export type ResultatsRecherche = { organisations: ResultatRecherche[]; contacts: ResultatRecherche[]; centres: ResultatRecherche[] };

/** Trois SELECT avec jointures : aucune lecture supplémentaire des organisations des contacts/centres.
 * ILIKE équivaut à startsWith/contains avec mode insensitive. Les jokers saisis restent littéraux.
 * Ni la requête ni les résultats ne sont journalisés.
 */
export async function rechercher(q: string): Promise<ResultatsRecherche> {
  const propre = normaliserRequete(q);
  if (!propre) return { organisations: [], contacts: [], centres: [] };
  const litteral = propre.replace(/[\\%_]/g, "\\$&");
  const debut = litteral + "%", mot = "% " + litteral + "%";
  const [organisations, contacts, centres] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number; libelle: string; etape: CrmEtapeCommerciale }>>`
      SELECT id, "raisonSocialeNom" AS libelle, etape FROM "CrmOrganisation"
      WHERE "raisonSocialeNom" ILIKE ${debut} OR "raisonSocialeNom" ILIKE ${mot}
      ORDER BY (etape IN ('PERDU', 'EN_SOMMEIL', 'ARRETE')), lower("raisonSocialeNom"), id LIMIT 8`,
    prisma.$queryRaw<ResultatRecherche[]>`
      SELECT c.id, c."organisationId", c.nom AS libelle,
        concat_ws(' · ', c.fonction, o."raisonSocialeNom") AS secondaire
      FROM "CrmContact" c JOIN "CrmOrganisation" o ON o.id = c."organisationId"
      WHERE c.nom ILIKE ${debut} OR c.nom ILIKE ${mot} OR c.email ILIKE ${debut}
      ORDER BY lower(c.nom), c.id LIMIT 8`,
    prisma.$queryRaw<ResultatRecherche[]>`
      SELECT c.id, c."organisationId", c.nom AS libelle,
        concat_ws(' · ', c.ville, o."raisonSocialeNom") AS secondaire
      FROM "CrmCentre" c JOIN "CrmOrganisation" o ON o.id = c."organisationId"
      WHERE c.nom ILIKE ${debut} OR c.nom ILIKE ${mot}
        OR c."codeSite" ILIKE ${debut} OR c."codeSite" ILIKE ${mot}
        OR c.ville ILIKE ${debut} OR c.ville ILIKE ${mot}
      ORDER BY lower(c.nom), c.id LIMIT 8`,
  ]);
  return { organisations: organisations.map((o) => ({ id: o.id, organisationId: o.id, libelle: o.libelle, secondaire: LIBELLES[o.etape] })), contacts, centres };
}

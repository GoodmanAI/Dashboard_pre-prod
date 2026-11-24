import { prisma } from "@/pilot/lib/prisma";
import { construireCsv, nomFichierExport, periodeExport, type LigneExport } from "./export";

/**
 * Lit seulement CrmCaMensuel, en une requête : les montants viennent du réel
 * figé, jamais des contrats ni des compteurs. Les jointures ne portent que des
 * noms d'organisation, de produit et de centre ; une ligne sans produit (lot S)
 * s'écrit « Hors catalogue » (`construireCsv`). Aucun journal : c'est une lecture.
 */
// La colonne est un horodatage UTC sans fuseau : la borne est passée comme tel,
// pour qu'aucun fuseau de session ne la décale.
const horodatage = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export async function exporterCa(parametres: { de: unknown; a: unknown }) {
  const { de, a, finExclue } = periodeExport(parametres);
  const lignes = await prisma.$queryRaw<LigneExport[]>`
    SELECT m.mois, o."raisonSocialeNom" AS organisation, p.name AS produit, c.nom AS centre,
      m."recurrentCentimes", m."variableCentimes", m."miseEnServiceCentimes", m."volumeVariable", m."uniteVariable"::text AS "uniteVariable"
    FROM "CrmCaMensuel" m
    JOIN "CrmOrganisation" o ON o.id = m."organisationId"
    LEFT JOIN "Product" p ON p.id = m."productId"
    LEFT JOIN "CrmCentre" c ON c.id = m."centreId"
    WHERE m.mois >= ${horodatage(de)}::timestamp AND m.mois < ${horodatage(finExclue)}::timestamp
    ORDER BY m.mois, o."raisonSocialeNom", p.name NULLS LAST, c.nom NULLS FIRST, m.id`;
  return { nom: nomFichierExport(de, a), contenu: construireCsv(lignes) };
}

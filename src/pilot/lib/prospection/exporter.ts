import { prisma } from "@/pilot/lib/prisma";
import { temperature } from "@/pilot/lib/organisations/temperature";
import { construireCsvProspects, nomFichierProspects, type DossierExport } from "./export";

/**
 * Tous les dossiers de l'équipe, toutes étapes, en une lecture : l'organisation,
 * ses contacts, ses sites et ses opportunités ouvertes. Le montant est celui du
 * dossier (opportunités estimées), comme sur le tableau Prospects : rien de la
 * page Chiffre d'affaires (C-64). Aucun journal : c'est une lecture.
 */
export async function exporterProspects(maintenant = new Date()) {
  const organisations = await prisma.crmOrganisation.findMany({
    include: {
      responsable: { select: { name: true } },
      chefDeProjet: { select: { name: true } },
      concurrent: { select: { nom: true } },
      concurrentGagnant: { select: { nom: true } },
      contacts: { orderBy: [{ principal: "desc" }, { nom: "asc" }, { id: "asc" }] },
      centres: { orderBy: [{ nom: "asc" }, { id: "asc" }], select: { nom: true, adresse: true, codePostal: true, ville: true, ris: true, _count: { select: { salles: true } } } },
      opportunites: { where: { gagneeLe: null, perdueLe: null }, include: { product: { select: { name: true } } } },
    },
    orderBy: [{ raisonSocialeNom: "asc" }, { id: "asc" }],
  });

  const dossiers: DossierExport[] = organisations.map((o) => {
    const t = temperature({ ...o, centres: o.centres.map((c) => ({ ris: c.ris, salles: c._count.salles })) }, maintenant);
    return {
      ...o,
      nom: o.raisonSocialeNom,
      temperature: t.affichee, temperatureForcee: t.forcage !== null,
      responsable: o.responsable?.name ?? null, chefDeProjet: o.chefDeProjet?.name ?? null,
      concurrent: o.concurrent?.nom ?? null, concurrentGagnant: o.concurrentGagnant?.nom ?? null,
      produits: Array.from(new Set(o.opportunites.map((x) => x.product.name))),
      mensuelEstimeCentimes: o.opportunites.reduce((t, x) => t + x.montantMensuelCentimes, 0),
      miseEnServiceEstimeeCentimes: o.opportunites.reduce((t, x) => t + x.montantMiseEnServiceCentimes, 0),
      centres: o.centres.map(({ nom, adresse, codePostal, ville, ris }) => ({ nom, adresse, codePostal, ville, ris })),
    };
  });
  return { nom: nomFichierProspects(maintenant), contenu: construireCsvProspects(dossiers) };
}

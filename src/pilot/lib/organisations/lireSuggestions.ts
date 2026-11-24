import { prisma } from "@/pilot/lib/prisma";
import { suggestionsMetier, suggestionsRdv, suggestionsRis, type SuggestionsSaisie } from "./suggestions";

/**
 * Lecture unique, au rendu d'une page : les RIS et outils de RDV déjà saisis sur
 * les organisations et les centres, et les métiers des contacts (C-88),
 * fusionnés avec la liste du code. Quatre regroupements, aucune requête à la
 * frappe ni par ligne.
 */
export async function lireSuggestions(): Promise<SuggestionsSaisie> {
  const [risOrganisations, rdvOrganisations, risCentres, metiers] = await Promise.all([
    prisma.crmOrganisation.groupBy({ by: ["ris"], where: { ris: { not: null } }, _count: { _all: true } }),
    prisma.crmOrganisation.groupBy({ by: ["outilRdv"], where: { outilRdv: { not: null } }, _count: { _all: true } }),
    prisma.crmCentre.groupBy({ by: ["ris"], where: { ris: { not: null } }, _count: { _all: true } }),
    prisma.crmContact.groupBy({ by: ["metier"], where: { metier: { not: null } }, _count: { _all: true } }),
  ]);
  return {
    ris: suggestionsRis([...risOrganisations, ...risCentres].map((g) => ({ valeur: g.ris, nombre: g._count._all }))),
    outilRdv: suggestionsRdv(rdvOrganisations.map((g) => ({ valeur: g.outilRdv, nombre: g._count._all }))),
    metier: suggestionsMetier(metiers.map((g) => ({ valeur: g.metier, nombre: g._count._all }))),
  };
}

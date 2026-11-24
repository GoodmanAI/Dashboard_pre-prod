import type { CrmTypeConcurrent } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

/** Ce qu'un sélecteur de concurrent a besoin de connaître : le nom, et la famille pour départager deux noms proches. */
export type OptionConcurrent = { id: number; nom: string; type: CrmTypeConcurrent };

/**
 * La liste des concurrents pour les sélecteurs, lue une fois au rendu d'une page
 * (jamais à la frappe). Une seule requête, sans relevés : ceux-ci ne servent qu'à
 * la page Concurrents.
 */
export async function optionsConcurrents(): Promise<OptionConcurrent[]> {
  return prisma.crmConcurrent.findMany({ select: { id: true, nom: true, type: true }, orderBy: { nom: "asc" } });
}

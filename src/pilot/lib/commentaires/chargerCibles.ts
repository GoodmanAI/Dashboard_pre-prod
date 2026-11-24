import { prisma } from "@/pilot/lib/prisma";
import { calculerCibles } from "./cibles";
import { lireEquipe } from "./equipe";

/**
 * Qui l'auteur peut prévenir (lot T) : une seule lecture des comptes internes,
 * avec leur accès et leur département (`lireEquipe`, la même que l'écriture).
 * Le tri et les nombres se calculent en mémoire (`calculerCibles`), sans
 * requête par département ni par personne.
 */
export async function chargerCibles(auteurId: number) {
  return calculerCibles(await lireEquipe(prisma), auteurId);
}

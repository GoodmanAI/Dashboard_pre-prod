import { prisma } from "@/pilot/lib/prisma";
import { compterCommentairesNonLus } from "./charger";

/**
 * La pastille du menu (lot T) : ce qui attend l'utilisateur dans « Pour vous ».
 * Deux comptes fixes, lus par `GET /api/pilot/pour-vous/compte`, que la
 * coquille appelle à chaque changement de page et après chaque action qui
 * change le compte : le nombre de requêtes ne dépend ni du nombre de demandes
 * ni de celui de commentaires.
 */
export async function compterPourVous(utilisateurId: number) {
  const [demandes, commentaires] = await Promise.all([
    prisma.crmDemande.count({ where: { destinataireId: utilisateurId, statut: "OUVERTE" } }),
    compterCommentairesNonLus(utilisateurId),
  ]);
  return { demandes, commentaires };
}
export type PourVous = Awaited<ReturnType<typeof compterPourVous>>;

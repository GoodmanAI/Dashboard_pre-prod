import { chargerDonneesAlertes } from "./charger";
import { calculerAlertes, filtrerAMoi } from "./calculer";
export * from "./types";
export { calculerAlertes, filtrerAMoi, trierAlertes } from "./calculer";

export async function calculerAlertesDuParc({ maintenant = new Date(), utilisateurId, organisationId }: {
  maintenant?: Date; utilisateurId?: number; organisationId?: number;
} = {}) {
  const resultat = calculerAlertes(await chargerDonneesAlertes(maintenant, organisationId), maintenant);
  return utilisateurId === undefined ? resultat : {
    actives: filtrerAMoi(resultat.actives, utilisateurId), acquittees: filtrerAMoi(resultat.acquittees, utilisateurId),
  };
}

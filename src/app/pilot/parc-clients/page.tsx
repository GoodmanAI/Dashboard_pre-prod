import { utilisateurCourant } from "@/pilot/lib/session";
import ParcClients from "@/pilot/ecrans/ParcClients";

export const dynamic = "force-dynamic";

/**
 * Le parc clients du Dashboard (statut de chaque centre et ce qui manque à sa
 * configuration), passé dans Pilot le 23/11/2026 avec le suivi du déploiement.
 * Changer le statut reste permis à l'équipe ; la configuration, elle, se règle
 * au Dashboard, par le super-administrateur.
 */
export default async function PageParcClients() {
  await utilisateurCourant();
  return <ParcClients />;
}

import { chargerSujets, clientsPourSujet, type VueSupport } from "@/pilot/lib/support/charger";
import { utilisateurCourant } from "@/pilot/lib/session";
import { ListeSupport } from "./ListeSupport";
import { DemandesDesClients } from "./DemandesDesClients";

export const dynamic = "force-dynamic";

const VUES: VueSupport[] = ["les-miens", "tous"];

/**
 * Le support, en une page (27/11/2026) : les sujets de l'équipe, et les demandes que les
 * clients écrivent depuis leur compte du Dashboard (`?vue=clients`).
 */
export default async function PageSupport({ searchParams }: { searchParams: { vue?: string } }) {
  const moi = await utilisateurCourant();
  if (searchParams.vue === "clients") return <DemandesDesClients />;
  const vue: VueSupport = VUES.includes(searchParams.vue as VueSupport) ? searchParams.vue as VueSupport : "les-miens";
  const [donnees, clients] = await Promise.all([chargerSujets(vue, moi.id), clientsPourSujet()]);
  return <ListeSupport vue={vue} donnees={donnees} clients={clients} />;
}

import { chargerSujets, clientsPourSujet, type VueSupport } from "@/pilot/lib/support/charger";
import { utilisateurCourant } from "@/pilot/lib/session";
import { ListeSupport } from "./ListeSupport";

export const dynamic = "force-dynamic";

const VUES: VueSupport[] = ["les-miens", "tous"];

export default async function PageSupport({ searchParams }: { searchParams: { vue?: string } }) {
  const vue: VueSupport = VUES.includes(searchParams.vue as VueSupport) ? searchParams.vue as VueSupport : "les-miens";
  const moi = await utilisateurCourant();
  const [donnees, clients] = await Promise.all([chargerSujets(vue, moi.id), clientsPourSujet()]);
  return <ListeSupport vue={vue} donnees={donnees} clients={clients} />;
}

import { chargerDemandes, type VueDemandes } from "@/pilot/lib/demandes/charger";
import { utilisateurCourant } from "@/pilot/lib/session";
import { ListeDemandes } from "./ListeDemandes";

export const dynamic = "force-dynamic";

const VUES: VueDemandes[] = ["pour-moi", "envoyees", "toutes"];

export default async function PageDemandes({ searchParams }: { searchParams: { vue?: string } }) {
  const vue: VueDemandes = VUES.includes(searchParams.vue as VueDemandes) ? searchParams.vue as VueDemandes : "pour-moi";
  const moi = await utilisateurCourant();
  return <ListeDemandes vue={vue} donnees={await chargerDemandes(vue, moi.id)} moi={{ id: moi.id, role: moi.role }} />;
}

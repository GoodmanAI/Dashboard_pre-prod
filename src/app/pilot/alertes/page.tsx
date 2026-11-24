import { chargerPageAlertes, type FiltresPageAlertes } from "@/pilot/lib/alertes/chargerPage";
import { ListeAlertes } from "./ListeAlertes";
export const dynamic = "force-dynamic";
export default async function Alertes({ searchParams }: { searchParams: FiltresPageAlertes }) {
  return <ListeAlertes donnees={await chargerPageAlertes(searchParams)} filtres={searchParams} />;
}
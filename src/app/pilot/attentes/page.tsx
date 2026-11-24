import { chargerAttentes } from "@/pilot/lib/checklist/chargerAttentes";
import type { FiltresIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import { ListeAttentes } from "./ListeAttentes";
export const dynamic = "force-dynamic";
export default async function Attentes({ searchParams }: { searchParams: FiltresIntegration }) {
  return <ListeAttentes donnees={await chargerAttentes(searchParams)} filtres={searchParams} />;
}

import { chargerParc, type FiltresParc } from "@/pilot/lib/parc/chargerParc";
import { Parc } from "./Parc";

export const dynamic = "force-dynamic";
export default async function PageParc({ searchParams }: { searchParams: FiltresParc }) {
  return <Parc donnees={await chargerParc(searchParams)} />;
}

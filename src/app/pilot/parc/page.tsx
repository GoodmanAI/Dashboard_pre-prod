import { chargerParc, type FiltresParc } from "@/pilot/lib/parc/chargerParc";
import ParcInstallation from "@/pilot/ecrans/ParcInstallation";
import { Parc } from "./Parc";

export const dynamic = "force-dynamic";
/**
 * Le parc, en une page (27/11/2026) : la santé des centres en production, puis
 * l'installation de chaque centre du Dashboard (ex-« Parc clients »).
 */
export default async function PageParc({ searchParams }: { searchParams: FiltresParc }) {
  return <>
    <Parc donnees={await chargerParc(searchParams)} />
    <div style={{ marginTop: 40 }}><ParcInstallation /></div>
  </>;
}

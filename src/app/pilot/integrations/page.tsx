import { chargerIntegrations, type FiltresIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import { comptesInternes } from "@/pilot/lib/referentiels";
import { utilisateurCourant } from "@/pilot/lib/session";
import { TableauIntegrations } from "./TableauIntegrations";

export const dynamic = "force-dynamic";
export default async function Integrations({ searchParams }: { searchParams: FiltresIntegration }) {
  const [donnees, comptes, moi] = await Promise.all([chargerIntegrations(searchParams), comptesInternes(), utilisateurCourant()]);
  return <TableauIntegrations donnees={donnees} filtres={searchParams} comptes={comptes} moi={{ id: moi.id, role: moi.role, administrateurPilot: moi.administrateurPilot, superAdmin: moi.superAdmin }} />;
}

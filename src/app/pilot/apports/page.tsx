import { exiger, peutExporter, peutLirePilot, peutModifierLesMontants, peutModifierPilot } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerApports } from "@/pilot/lib/apports/charger";
import { ApportsAffaires } from "./ApportsAffaires";

export const dynamic = "force-dynamic";

/**
 * L'apport d'affaires (CHOIX.md, C-63) : les groupes apportés, leurs sites et
 * leurs salles, le suivi des commissions mois par mois et les factures des
 * apporteurs. Repris du calculateur des apporteurs.
 */
export default async function PageApports() {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const donnees = await chargerApports();
  return <ApportsAffaires donnees={donnees}
    droits={{ modifier: peutModifierPilot(courant.role), montants: peutModifierLesMontants(courant), exporter: peutExporter(courant) }} />;
}

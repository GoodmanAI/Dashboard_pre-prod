import { exiger, peutLirePilot, peutModifierPilot } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { listerConcurrents } from "@/pilot/lib/concurrents/lire";
import { Concurrents } from "./Concurrents";
import type { LigneConcurrent } from "./types";

export const dynamic = "force-dynamic";

/**
 * Les concurrents (lot R) : ce que l'équipe sait d'eux, leurs prix relevés et les
 * établissements où ils sont en place. Une seule lecture pour toute la liste.
 */
export default async function PageConcurrents() {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const lignes: LigneConcurrent[] = (await listerConcurrents()).map((c) => ({
    id: c.id, nom: c.nom, type: c.type, offre: c.offre, siteWeb: c.siteWeb, notes: c.notes, majLe: c.majLe.toISOString(),
    enVigueur: c.enVigueur ? { prixSalleMoisCentimes: c.enVigueur.prixSalleMoisCentimes, releveLe: c.enVigueur.releveLe.toISOString() } : null,
    nombreReleves: c.nombreReleves, centresEquipes: c.centresEquipes, affairesPerdues: c.affairesPerdues,
  }));
  return <Concurrents concurrents={lignes} peutModifier={peutModifierPilot(courant.role)} />;
}

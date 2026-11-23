import { notFound } from "next/navigation";
import { exiger, peutLirePilot, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { utilisateurCourant } from "@/pilot/lib/session";
import { lireConcurrent } from "@/pilot/lib/concurrents/lire";
import { FicheConcurrent } from "./FicheConcurrent";

export const dynamic = "force-dynamic";

/** La fiche d'un concurrent (lot R) : son offre, ses relevés de prix, où il est en place et les affaires perdues contre lui. */
export default async function PageConcurrent({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) notFound();
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const concurrent = await lireConcurrent(id).catch((e: unknown) => { if (e instanceof ErreurMetier && e.statut === 404) notFound(); throw e; });
  return <FicheConcurrent peutModifier={peutModifierPilot(courant.role)}
    concurrent={{ id: concurrent.id, nom: concurrent.nom, type: concurrent.type, offre: concurrent.offre, siteWeb: concurrent.siteWeb, notes: concurrent.notes, majLe: concurrent.majLe.toISOString() }}
    releves={concurrent.releves.map((r) => ({ id: r.id, releveLe: r.releveLe.toISOString(), prixSalleMoisCentimes: r.prixSalleMoisCentimes,
      prixInstallationCentimes: r.prixInstallationCentimes, conditions: r.conditions, source: r.source, enVigueur: r.enVigueur, majLe: r.majLe.toISOString() }))}
    centresEquipes={concurrent.centresEquipes}
    affairesPerdues={concurrent.affairesPerdues.map((a) => ({ ...a, dateSortie: a.dateSortie?.toISOString() ?? null }))} />;
}

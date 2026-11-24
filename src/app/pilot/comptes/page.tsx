import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerReprise } from "@/pilot/lib/reprise/charger";
import type { CompteARelier } from "@/pilot/lib/reprise/regles";
import { ComptesARelier, type CompteVue } from "./ComptesARelier";

export const dynamic = "force-dynamic";

/** Les dates passent en texte ISO vers le composant client. */
function vue(c: CompteARelier): CompteVue {
  return { ...c, ecarte: c.ecarte && { raison: c.ecarte.raison, le: c.ecarte.le.toISOString() },
    acces: c.acces.map((a) => ({ ...a, dernierAppelLe: a.dernierAppelLe?.toISOString() ?? null })) };
}

export default async function Comptes() {
  const [d, utilisateur] = await Promise.all([chargerReprise(), utilisateurCourant()]);
  return <ComptesARelier courantId={utilisateur.id} resume={d.resume} aRelier={d.aRelier.map(vue)} aAjouter={d.aAjouter.map(vue)}
    ecartes={d.ecartes.map(vue)} contrats={d.contrats} organisations={d.organisations} internes={d.internes} />;
}

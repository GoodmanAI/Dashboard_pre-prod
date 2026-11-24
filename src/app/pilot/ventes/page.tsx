import { exiger, peutLirePilot, peutVoirCa, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerVentes, type Segment } from "@/pilot/lib/ventes/charger";
import { Ventes } from "./Ventes";

export const dynamic = "force-dynamic";

const SEGMENTS: Segment[] = ["en_cours", "a_completer", "termines"];

/** Ce qui a été vendu : un client signé par carte, ses dates clés, ses produits, ses tarifs (CHOIX.md, C-62). */
export default async function PageVentes({ searchParams }: { searchParams: { vue?: string; segment?: string } }) {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const equipe = searchParams.vue === "equipe";
  const segment = SEGMENTS.find((s) => s === searchParams.segment) ?? "en_cours";
  const { segments, mensuelCentimes } = await chargerVentes({ utilisateurId: courant.id, equipe });
  return <Ventes facturationVisible={peutVoirCa(courant)} equipe={equipe} segment={segment} ventes={segments[segment]} mensuelCentimes={mensuelCentimes}
    comptes={{ en_cours: segments.en_cours.length, a_completer: segments.a_completer.length, termines: segments.termines.length }}
    modifiable={peutModifierLesMontants(courant)} />;
}

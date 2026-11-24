import { comptesInternes } from "@/pilot/lib/referentiels";
import { lireSuggestions } from "@/pilot/lib/organisations/lireSuggestions";
import { utilisateurCourant } from "@/pilot/lib/session";
import { FormulaireOrganisation } from "./FormulaireOrganisation";

export const dynamic = "force-dynamic";

export default async function NouvelleOrganisation({ searchParams }: { searchParams: { nom?: string } }) {
  const [comptes, courant, suggestions] = await Promise.all([comptesInternes(), utilisateurCourant(), lireSuggestions()]);
  return <FormulaireOrganisation comptes={comptes} courantId={courant.id} suggestions={suggestions} nomInitial={(searchParams.nom ?? "").trim().slice(0, 200)} />;
}

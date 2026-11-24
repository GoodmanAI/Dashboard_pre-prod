import { notFound } from "next/navigation";
import { utilisateurCourant } from "@/pilot/lib/session";
import { peutExporterCa, peutVoirCa } from "@/pilot/lib/autorisations";
import { chargerDonneesCa } from "@/pilot/lib/ca/donnees";
import { moisCourant } from "@/pilot/lib/ca/moisCourant";
import { decalerMois } from "@/pilot/lib/ca/projeter";
import { AccesRefuse } from "@/pilot/components/AccesRefuse";
import { ChiffreAffaires } from "./ChiffreAffaires";

export const dynamic = "force-dynamic";
export default async function Ca({ searchParams }: { searchParams: { scenario?: string } }) {
  const utilisateur = await utilisateurCourant();
  // Rien n'est lu tant que le droit manque : la page ne porte aucun montant (C-64).
  if (!peutVoirCa(utilisateur)) {
    return utilisateur.profil === "DEVELOPPEUR"
      ? <AccesRefuse titre="Chiffre d'affaires" raison="Un développeur ne voit pas le chiffre d'affaires."
        suite="Si votre rôle a changé, demandez au super-administrateur de vous passer en gérant." />
      : <AccesRefuse titre="Chiffre d'affaires" raison="Le droit « Voir le chiffre d'affaires » ne vous a pas été donné."
        suite="Le super-administrateur peut vous l'ouvrir depuis l'écran Équipe." />;
  }
  const maintenant = new Date();
  const [donnees, courant] = await Promise.all([chargerDonneesCa(maintenant), moisCourant(maintenant)]);
  const scenarioId = searchParams.scenario ? Number(searchParams.scenario) : null;
  if (scenarioId !== null && !donnees.scenarios.some((s) => s.id === scenarioId)) notFound();
  return <ChiffreAffaires donnees={donnees} scenarioInitial={scenarioId} moisDepart={decalerMois(maintenant, 0).toISOString()}
    moisCourant={courant} peutExporter={peutExporterCa(utilisateur)} />;
}

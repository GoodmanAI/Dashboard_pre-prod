import { euros } from "@/pilot/lib/argent";
import { exiger, peutLirePilot, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import Stack from "@mui/material/Stack";
import { BoutonExportProspects } from "@/pilot/components/BoutonExportProspects";
import { ImportProspects } from "@/pilot/components/ImportProspects";
import { Bascule, EnTete } from "@/pilot/components/Bloc";
import { compter } from "@/pilot/lib/texte";
import { NouveauProspect } from "./NouveauProspect";
import { comptesInternes } from "@/pilot/lib/referentiels";
import { lireSuggestions } from "@/pilot/lib/organisations/lireSuggestions";
import { grillePourEstimation, lireGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { optionsConcurrents } from "@/pilot/lib/concurrents/options";
import { chargerTableauProspects } from "@/pilot/lib/prospection/chargerTableau";
import { utilisateurCourant } from "@/pilot/lib/session";
import { ETAPES_COMMERCIALES } from "@/pilot/lib/pipeline";
import { FAMILLES, PipelineTableau, type Famille } from "./PipelineTableau";

export const dynamic = "force-dynamic";

export default async function Pipeline({ searchParams }: { searchParams: { vue?: string; famille?: string } }) {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const equipe = searchParams.vue === "equipe";
  const famille: Famille = searchParams.famille && Object.hasOwn(FAMILLES, searchParams.famille) ? searchParams.famille as Famille : "commercial";
  const [comptes, suggestions, grille, cartes, concurrents] = await Promise.all([
    comptesInternes(), lireSuggestions(), lireGrilleEnVigueur(), chargerTableauProspects({ equipe, utilisateurId: courant.id }), optionsConcurrents(),
  ]);

  const montantsModifiables = peutModifierLesMontants(courant);
  const commerciales = cartes.filter((c) => ETAPES_COMMERCIALES.includes(c.etape));
  const pondereTotal = commerciales.reduce((total, c) => total + c.montantPondereCentimes, 0);
  const lienVue = (vue: string) => `/pilot/pipeline?vue=${vue}&famille=${famille}`;

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      <EnTete titre="Prospects" sousTitre={`${compter(commerciales.length, "prospect en cours", "prospects en cours")} · ${euros(pondereTotal)} / mois probables`}>
        <Bascule libelle="Dossiers affichés" equipe={equipe} moi={lienVue("moi")} tous={lienVue("equipe")} />
        <BoutonExportProspects />
        <ImportProspects />
        <NouveauProspect comptes={comptes} courantId={courant.id} suggestions={suggestions} grille={grillePourEstimation(grille)} montantsModifiables={montantsModifiables} concurrents={concurrents} />
      </EnTete>
      <PipelineTableau cartes={cartes} famille={famille} vue={equipe ? "equipe" : "moi"} montantsModifiables={montantsModifiables} concurrents={concurrents} />
    </Stack>
  );
}

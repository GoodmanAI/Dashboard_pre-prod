import Stack from "@mui/material/Stack";
import { BoutonExportProspects } from "@/pilot/components/BoutonExportProspects";
import { ImportProspects } from "@/pilot/components/ImportProspects";
import type { CrmEtapeCommerciale } from "@prisma/client";
import { exiger, peutLirePilot, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { comptesInternes } from "@/pilot/lib/referentiels";
import { lireSuggestions } from "@/pilot/lib/organisations/lireSuggestions";
import { grillePourEstimation, lireGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { prisma } from "@/pilot/lib/prisma";
import { optionsConcurrents } from "@/pilot/lib/concurrents/options";
import { ETAPES_COMMERCIALES, ETAPES_LIVRAISON, ETAPES_SORTIE, LIBELLES } from "@/pilot/lib/pipeline";
import { chargerProspection, type FiltresProspection } from "@/pilot/lib/prospection/charger";
import { EnTete } from "@/pilot/components/Bloc";
import { NavFamilles } from "../NavFamilles";
import { NouveauProspect } from "../NouveauProspect";
import { VueProspection } from "./VueProspection";

export const dynamic = "force-dynamic";

/** La liste « À prospecter » (C-65) : les établissements à l'étape Prospect, à filtrer et à trier. */
export default async function Prospection({ searchParams }: { searchParams: FiltresProspection }) {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  // Le texte cherché ne passe jamais par l'URL (C-36) : seuls les filtres en viennent.
  const { q: _ignore, page: _page, ...filtres } = searchParams;
  void _ignore; void _page;
  const [donnees, comptes, suggestions, grille, parEtape, concurrents] = await Promise.all([
    chargerProspection(filtres, courant.id),
    comptesInternes(),
    lireSuggestions(),
    lireGrilleEnVigueur(),
    prisma.crmOrganisation.groupBy({ by: ["etape"], _count: { _all: true } }),
    optionsConcurrents(),
  ]);
  const compte = (etapes: readonly CrmEtapeCommerciale[]) =>
    parEtape.filter((e) => etapes.includes(e.etape)).reduce((t, e) => t + e._count._all, 0);
  const famille = (cle: string, nom: string, etapes: readonly CrmEtapeCommerciale[]) =>
    ({ cle, nom, href: `/pilot/pipeline?vue=equipe&famille=${cle}`, compte: compte(etapes), detail: etapes.map((e) => LIBELLES[e]).join(", ") });

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      <EnTete titre="Prospects" sousTitre="Les établissements à contacter ou à qualifier, du plus prioritaire au moins prioritaire.">
        <BoutonExportProspects />
        <ImportProspects />
        <NouveauProspect comptes={comptes} courantId={courant.id} suggestions={suggestions} grille={grillePourEstimation(grille)} montantsModifiables={peutModifierLesMontants(courant)} concurrents={concurrents} />
      </EnTete>
      <NavFamilles actif="prospection" entrees={[
        { cle: "prospection", nom: "À prospecter", detail: "Liste filtrable : région, RIS, priorité, température", href: "/pilot/pipeline/prospection", compte: compte(["PROSPECT"]) },
        famille("commercial", "Avant la signature", ETAPES_COMMERCIALES),
        famille("sorties", "Perdus et en pause", ETAPES_SORTIE),
      ]} />
      <VueProspection initiale={donnees} filtresInitiaux={filtres} comptes={comptes.map((c) => ({ id: c.id, name: c.name }))} moiId={courant.id} />
    </Stack>
  );
}

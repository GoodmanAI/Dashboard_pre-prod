"use client";
import { IconAlertOctagon, IconAlertTriangle, IconCircleCheck, IconClockPause } from "@tabler/icons-react";
import { Alert, Button, Stack } from "@mui/material";
import type { FiltresPageAlertes, PageAlertes } from "@/pilot/lib/alertes/chargerPage";
import { LIBELLES_TYPES_ALERTE } from "@/pilot/lib/alertes/types";
import { LigneAlerte } from "@/pilot/components/LigneAlerte";
import { Bascule, Bloc, EnTete } from "@/pilot/components/Bloc";
import { Filtre } from "@/pilot/components/formulaires/FiltresAttentes";

export function ListeAlertes({ donnees: d, filtres }: { donnees: PageAlertes; filtres: FiltresPageAlertes }) {
  function vue(equipe: boolean) {
    const recherche = new URLSearchParams();
    if (equipe) recherche.set("vue", "equipe");
    for (const cle of ["niveau", "type", "organisationId"] as const) if (filtres[cle]) recherche.set(cle, filtres[cle]!);
    return `/pilot/alertes?${recherche}`;
  }
  return <Stack spacing={2.5}>
    <EnTete titre="Alertes" sousTitre="Ce qui demande une décision, et qui doit agir. Reportez une alerte si elle peut attendre.">
      <Bascule libelle="Alertes affichées" equipe={d.equipe} moi={vue(false)} tous={vue(true)} />
    </EnTete>
    {!d.directeurDesigne && <Alert severity="info" icon={false}>
      Aucun directeur général n&apos;est désigné : les alertes vont au super-administrateur. Il le désigne dans l&apos;écran Équipe.
    </Alert>}
    <Stack key={JSON.stringify(filtres)} component="form" method="get" direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
      {d.equipe && <input type="hidden" name="vue" value="equipe" />}
      <Filtre nom="niveau" libelle="Niveau" valeur={filtres.niveau} tous="tous"><option value="bloquant">Bloquant</option><option value="attention">Attention</option></Filtre>
      <Filtre nom="type" libelle="Type" valeur={filtres.type} tous="tous">{Object.entries(LIBELLES_TYPES_ALERTE).map(([type, libelle]) => <option key={type} value={type}>{libelle}</option>)}</Filtre>
      <Filtre nom="organisationId" libelle="Organisation" valeur={filtres.organisationId} tous="toutes">{d.organisations.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</Filtre>
      <Button type="submit" variant="outlined">Filtrer</Button>
    </Stack>
    {!d.actives.length && <Bloc icone={IconCircleCheck} teinte="vert" titre="Alertes actives" vide="Aucune alerte. Tout est à jour." />}
    {(["bloquant", "attention"] as const).map((niveau) => {
      const alertes = d.actives.filter((a) => a.niveau === niveau);
      return alertes.length > 0 && <Bloc key={niveau} icone={niveau === "bloquant" ? IconAlertOctagon : IconAlertTriangle} teinte={niveau === "bloquant" ? "rouge" : "orange"} titre={niveau === "bloquant" ? "Bloquantes" : "Attention"} nombre={alertes.length}>
        {alertes.map((a) => <LigneAlerte key={a.cle} alerte={a} confier={d.peutConfier} />)}
      </Bloc>;
    })}
    <Bloc icone={IconClockPause} teinte="gris" titre="Reportées" nombre={d.acquittees.length} vide={!d.acquittees.length && "Aucune alerte reportée."}>
      {d.acquittees.map((a) => <LigneAlerte key={a.cle} alerte={a} acquittement={a.acquittement} confier={d.peutConfier} />)}
    </Bloc>
  </Stack>;
}

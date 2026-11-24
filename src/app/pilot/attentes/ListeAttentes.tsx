"use client";
import { IconHourglass } from "@tabler/icons-react";
import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { chargerAttentes } from "@/pilot/lib/checklist/chargerAttentes";
import type { FiltresIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import { LIBELLES_TIERS, ORDRE_TIERS, relanceDue } from "@/pilot/lib/checklist/reglesAttentes";
import { debutDuJour } from "@/pilot/lib/dates";
import { ActionsAttente } from "@/pilot/components/formulaires/ActionsAttente";
import { FiltresAttentes } from "@/pilot/components/formulaires/FiltresAttentes";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";

const date = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
export function ListeAttentes({ donnees: d, filtres }: { donnees: Awaited<ReturnType<typeof chargerAttentes>>; filtres: FiltresIntegration }) {
  const maintenant = new Date();
  const lienPage = (page: number) => `/pilot/attentes?${new URLSearchParams({ ...(filtres.tiers ? { tiers: filtres.tiers } : {}), ...(filtres.aMoi ? { aMoi: filtres.aMoi } : {}), page: String(page) })}`;
  return <Stack spacing={2.5}>
    <EnTete titre="Relances" sousTitre="Ce que l'on attend d'EDL, d'un opérateur, du client ou d'un prestataire, et quand relancer." />
    <FiltresAttentes filtres={filtres} />
    {!d.lignes.length && <Bloc icone={IconHourglass} teinte="jaune" titre="Relances" lien="/pilot/integrations" action="Voir les déploiements" vide="Personne à relancer. Une attente se déclare depuis une étape de mise en service." />}
    {ORDRE_TIERS.map((tiers) => {
      const lignes = d.lignes.filter((e) => e.enAttenteDe === tiers);
      if (!lignes.length) return null;
      return <Bloc key={tiers} icone={IconHourglass} teinte="jaune" titre={LIBELLES_TIERS[tiers]} nombre={`${lignes.length}${d.suite || d.page > 1 ? " sur cette page" : ""}`}>
        {lignes.map((e) => {
          const depassee = e.echeanceLe && new Date(e.echeanceLe) < debutDuJour(maintenant);
          const due = relanceDue({ demandeeLe: e.demandeeLe ? new Date(e.demandeeLe) : null, derniereRelanceLe: e.derniereRelanceLe ? new Date(e.derniereRelanceLe) : null }, maintenant);
          return <Ligne key={e.id} nom={<><Link href={`/pilot/organisations/${e.organisationId}?onglet=centres`}>{e.organisationNom}</Link> · {e.centreNom} · {e.produit}</>}
            detail={<>
              <Box sx={{ color: "text.primary" }}>{e.libelle}</Box>
              <Box>{e.demandeeLe ? `demandé il y a ${Math.floor((debutDuJour(maintenant).getTime() - debutDuJour(new Date(e.demandeeLe)).getTime()) / 86400000)} j` : "Date de demande non renseignée"}
                {" · "}<Box component="span" sx={due ? { color: "warning.main" } : undefined}>{e.derniereRelanceLe ? `relancé le ${date(e.derniereRelanceLe)}` : "jamais relancé"}</Box></Box>
              {e.echeanceLe && <Box sx={depassee ? { color: "error.main" } : undefined}>Échéance : {date(e.echeanceLe)}{depassee ? " · dépassée" : ""}</Box>}
            </>}>
            <ActionsAttente id={e.id} />
            <Button component={Link} href={`/pilot/organisations/${e.organisationId}?onglet=centres`} variant="outlined">Ouvrir</Button>
          </Ligne>;
        })}
      </Bloc>;
    })}
    {(d.suite || d.page > 1) && <Stack direction="row" spacing={2}><Typography variant="caption">Page {d.page}. 50 lignes au plus.</Typography>
      {d.page > 1 && <Button component={Link} href={lienPage(d.page - 1)}>Page précédente</Button>}{d.suite && <Button component={Link} href={lienPage(d.page + 1)}>Page suivante</Button>}
    </Stack>}
  </Stack>;
}

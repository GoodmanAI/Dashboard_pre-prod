"use client";
import { Box, Stack, Typography } from "@mui/material";
import { eurosPrecis } from "@/pilot/lib/argent";
import { JETONS } from "@/pilot/jetons";
import { phraseUsage, recapitulatif } from "@/pilot/lib/propositions/affichage";
import { totauxProposition } from "@/pilot/lib/propositions/regles";

type Totaux = ReturnType<typeof totauxProposition>;

/** Les montants nets d'une version, en trois lignes : l'abonnement par mois, ce qui se facture une fois, la part à l'usage. */
export function MontantsProposition({ totaux }: { totaux: Totaux }) {
  return <Stack spacing={0.5}>
    <Typography>{eurosPrecis(totaux.abonnementMensuelCentimes)} par mois</Typography>
    <Typography variant="body2" color="text.secondary">{totaux.miseEnServiceCentimes ? `Frais d'installation : ${eurosPrecis(totaux.miseEnServiceCentimes)}` : "Sans frais d'installation"}</Typography>
    {totaux.prestationCentimes > 0 && <Typography variant="body2" color="text.secondary">Prestations : {eurosPrecis(totaux.prestationCentimes)}, une fois</Typography>}
    {totaux.variables.map((v, i) => <Typography key={i} variant="body2" color="text.secondary">{phraseUsage(v)}</Typography>)}
  </Stack>;
}

/**
 * Le récapitulatif : par famille, le brut, la remise, les gestes commerciaux et
 * le net, au centime (abonnement par mois, installation et prestations une
 * fois). Tout vient de `totauxProposition` et de `recapitulatif` : l'écran ne
 * calcule rien. Pas de tableau : deux colonnes de grille, jamais de défilement.
 */
export function RecapitulatifProposition({ totaux }: { totaux: Totaux }) {
  const sections = recapitulatif(totaux);
  if (!sections.length && !totaux.variables.length) {
    return <Typography variant="body2" color="text.secondary">Aucun montant pour l&apos;instant. Renseignez le prix d&apos;au moins une ligne.</Typography>;
  }
  return <Stack spacing={1.5} data-recapitulatif>
    {sections.map((s) => <Box key={s.cle} data-famille={s.cle}>
      <Typography component="div" sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
        {s.titre} <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>{s.suite}</Box>
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 2, rowGap: 0.25 }}>
        {s.lignes.map((l) => [
          <Typography key={l.libelle} component="div" variant="body2" sx={{ minWidth: 0, pl: l.secondaire ? 1.5 : 0, fontWeight: l.fort ? 600 : 400, color: l.secondaire ? "text.secondary" : "text.primary", overflowWrap: "anywhere" }}>{l.libelle}</Typography>,
          <Typography key={l.libelle + "-montant"} component="div" variant="body2" sx={{ textAlign: "right", fontWeight: l.fort ? 600 : 400, color: l.secondaire ? "text.secondary" : "text.primary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{l.montant}</Typography>,
        ])}
      </Box>
    </Box>)}
    {!!totaux.variables.length && <Box data-famille="usage">
      <Typography component="div" sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Part à l&apos;usage</Typography>
      {totaux.variables.map((v, i) => <Typography key={i} variant="body2">{phraseUsage(v)}</Typography>)}
    </Box>}
  </Stack>;
}

/** Le récapitulatif posé dans une zone douce, pour un dialogue. */
export function ZoneRecapitulatif({ totaux }: { totaux: Totaux }) {
  return <Box sx={{ bgcolor: JETONS.gris, borderRadius: "12px", px: 2, py: 1.5 }}><RecapitulatifProposition totaux={totaux} /></Box>;
}

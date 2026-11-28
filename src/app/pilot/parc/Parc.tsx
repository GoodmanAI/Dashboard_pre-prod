"use client";
import { IconRefresh } from "@tabler/icons-react";
import Link from "next/link";
import { Box, Button, Card, Chip, Stack, Typography } from "@mui/material";
import type { DonneesParc, LigneParc } from "@/pilot/lib/parc/chargerParc";
import { gravite, type CouleurFeu, type Feu } from "@/pilot/lib/parc/sante";
import { dateCourte } from "@/pilot/lib/integration/estimation";
import { Bascule, Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { FEUX, JETONS } from "@/pilot/jetons";

const TEXTES: Record<CouleurFeu, { mot: string; couleur: string }> = {
  vert: { mot: "Vert", couleur: "success.main" }, orange: { mot: "Orange", couleur: "warning.main" },
  rouge: { mot: "Rouge", couleur: "error.main" }, gris: { mot: "Gris", couleur: "text.secondary" },
};
/** Lu par le lecteur d'écran, invisible à l'œil : la couleur et la phrase derrière les chiffres. */
const masque = { position: "absolute", width: "1px", height: "1px", p: 0, m: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

function PastilleFeu({ cle, feu }: { cle: string; feu: Feu }) {
  const texte = TEXTES[feu.couleur];
  return <Box component="li" data-feu={cle} data-couleur={feu.couleur} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", minWidth: 0, px: 1.5, py: 1.25, borderRadius: "14px", bgcolor: JETONS.surface }}>
    <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: FEUX[feu.couleur], flexShrink: 0, mt: "5px" }} />
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="baseline">
        <Typography fontWeight={600}>{feu.libelle}<Box component="span" sx={masque}>, feu {feu.couleur}</Box></Typography>
        <Typography aria-hidden variant="caption" fontWeight={500} color={texte.couleur}>{texte.mot}</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div">{feu.raison}</Typography>
    </Box>
  </Box>;
}

function LigneCentre({ ligne: l }: { ligne: LigneParc }) {
  return <Box component="article" aria-label={`${l.organisationNom}, ${l.centreNom}, ${l.produit}`} data-centre-produit={l.id}
    sx={{ px: 2.5, py: 2, "& + &": { borderTop: `1px solid ${JETONS.filetInterne}` } }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center">
      <Typography sx={{ fontSize: 15, fontWeight: 600 }} component="div"><Link href={l.lienFiche}>{l.organisationNom}</Link> <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {l.centreNom}</Box></Typography>
      <Chip label={l.produit} />
      {l.suiviRenforceJusquAu && <Chip color="info" label={`Suivi renforcé jusqu'au ${dateCourte(l.suiviRenforceJusquAu)}`} />}
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} sx={{ ml: "auto" }}>
        <Button component={Link} href={l.lienFiche} variant="outlined">Ouvrir la fiche</Button>
        <Button component={Link} href={l.lienChecklist}>Voir les étapes</Button>
      </Stack>
    </Stack>
    {l.mention && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{l.mention}</Typography>}
    <Box component="ul" aria-label="Indicateurs" sx={{ listStyle: "none", m: 0, mt: 1.5, p: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 1.25 }}>
      <PastilleFeu cle="usage" feu={l.sante.usage} /><PastilleFeu cle="rdv" feu={l.sante.rdv} />
      <PastilleFeu cle="incidents" feu={l.sante.incidents} /><PastilleFeu cle="silence" feu={l.sante.silence} />
    </Box>
    {l.afficherDesk && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} data-desk={l.sante.desk.disponible ? "disponible" : "absent"}>
      Adoption de Desk : {l.sante.desk.texte}</Typography>}
  </Box>;
}

function Chiffre({ valeur, libelle, couleur = "text.primary" }: { valeur: number; libelle: string; couleur?: string }) {
  return <Box><Typography aria-hidden sx={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: valeur ? couleur : "text.secondary" }}>{valeur}</Typography>
    <Typography aria-hidden variant="body2" color="text.secondary">{libelle}</Typography></Box>;
}

export function Parc({ donnees: d }: { donnees: DonneesParc }) {
  const gravites = d.lignes.map((l) => gravite(l.sante));
  const rouges = gravites.filter((g) => g.rouges > 0).length;
  const oranges = gravites.filter((g) => g.rouges === 0 && g.oranges > 0).length;
  return <Stack spacing={2.5}>
    <EnTete titre="Centres à surveiller" sousTitre="Les centres en service qui décrochent, en haut. Appelez ceux en rouge.">
      <Bascule libelle="Centres affichés" equipe={d.equipe} moi="/pilot/parc" tous="/pilot/parc?vue=equipe" />
    </EnTete>
    {d.lignes.length ? <>
      <Box data-testid="parc-resume" sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        <Box component="span" sx={masque}>{d.resume}</Box>
        <Chiffre valeur={d.lignes.length} libelle={d.lignes.length > 1 ? "centres en service" : "centre en service"} />
        <Chiffre valeur={rouges} libelle="en rouge" couleur="error.main" />
        <Chiffre valeur={oranges} libelle="en orange" couleur="warning.main" />
        <Chiffre valeur={d.lignes.length - rouges - oranges} libelle="en vert" couleur="success.main" />
      </Box>
      <Card component="section" aria-label="Centres en service">{d.lignes.map((l) => <LigneCentre key={l.id} ligne={l} />)}</Card>
    </> : <Card component="section" aria-label="Centres en service" sx={{ px: 2.5, py: 2.25 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5} alignItems="center">
        <Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 240px" }}>Aucun centre en service. Un centre apparaît ici dès que sa mise en service est déclarée.</Typography>
        <Button component={Link} href="/pilot/integrations" variant="outlined">Voir les intégrations</Button>
      </Stack>
    </Card>}
    <Bloc icone={IconRefresh} teinte="sarcelle" titre="Renouvellements et fins d'engagement à 90 jours" nombre={d.renouvellements.length} vide={!d.renouvellements.length && "Aucun renouvellement ni fin d'engagement dans les 90 jours."}>
      {d.renouvellements.map((r) => <Ligne key={r.id} data-contrat={r.id} nom={<Link href={r.lien}>{r.organisationNom}{r.reference ? ` · ${r.reference}` : ""}</Link>}
        detail={<><Box>Échéance le {dateCourte(r.echeance)}</Box><Box>{r.detail}</Box></>}>
        <Button component={Link} href={r.lien} variant="outlined">Ouvrir l&apos;onglet Argent</Button>
      </Ligne>)}
    </Bloc>
  </Stack>;
}

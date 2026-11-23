"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Card, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { EnTete } from "@/pilot/components/Bloc";
import { euros } from "@/pilot/lib/argent";
import { ajouterMois, creerMoteur, libelleMois, palierPour, pourcentage, type Vue } from "@/pilot/lib/apports/calcul";
import { contexteDe, type DonneesApports } from "@/pilot/lib/apports/charger";
import { avisGrille } from "@/pilot/lib/apports/prix";
import { TEINTES } from "@/pilot/jetons";
import { EtatSauvegarde, FournisseurSauvegarde, nomCourt, useSauvegarde } from "./commun";
import { OngletGroupes } from "./OngletGroupes";
import { OngletSuivi } from "./OngletSuivi";
import { OngletFactures } from "./OngletFactures";
import { OngletParametres } from "./OngletParametres";

export type Droits = { modifier: boolean; montants: boolean; exporter: boolean };
const ONGLETS = { groupes: "Groupes", suivi: "Suivi mensuel et prévisionnel", factures: "Factures", parametres: "Réglages" } as const;
type Onglet = keyof typeof ONGLETS;

export function ApportsAffaires(props: { donnees: DonneesApports; droits: Droits }) {
  return <FournisseurSauvegarde><Contenu {...props} /></FournisseurSauvegarde>;
}

function Contenu({ donnees: d, droits }: { donnees: DonneesApports; droits: Droits }) {
  const router = useRouter(), chemin = (usePathname() ?? ""), recherche = useSearchParams()!;
  const { etat, effacerErreur } = useSauvegarde();
  const brut = recherche.get("onglet");
  const onglet: Onglet = brut && Object.hasOwn(ONGLETS, brut) ? brut as Onglet : "groupes";
  const vueBrute = recherche.get("apporteur");
  const vue: Vue = vueBrute && d.apporteurs.some((a) => String(a.id) === vueBrute) ? Number(vueBrute) : "tous";
  const moteur = useMemo(() => creerMoteur(contexteDe(d)), [d]);
  const indic = moteur.indicateurs(vue);

  function aller(changes: Record<string, string | null>) {
    const p = new URLSearchParams(recherche.toString());
    for (const [k, v] of Object.entries(changes)) if (v === null) p.delete(k); else p.set(k, v);
    router.replace(`${chemin}?${p}`, { scroll: false });
  }
  const libelleVue = vue === "tous" ? "Tous les apporteurs" : moteur.apporteur(vue)?.nom ?? "Apporteur";

  return <Stack spacing={2.5}>
    <EnTete titre="Apport d'affaires" sousTitre="Les groupes apportés site par site et salle par salle, l'avancement des commandes, les commissions mois par mois et les factures des apporteurs.">
      <Stack spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
        <TextField select size="small" label="Apporteur" value={vue === "tous" ? "tous" : String(vue)} sx={{ minWidth: 240 }}
          onChange={(e) => aller({ apporteur: e.target.value === "tous" ? null : e.target.value, mois: null, facturant: null })}>
          <MenuItem value="tous">Tous les apporteurs</MenuItem>
          {d.apporteurs.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.nom}{a.structure ? ` (${a.structure})` : ""}</MenuItem>)}
        </TextField>
        <EtatSauvegarde />
      </Stack>
    </EnTete>
    {etat.erreur && <Alert severity="error" onClose={effacerErreur}>{etat.erreur}</Alert>}
    {onglet !== "parametres" && avisGrille(d.grille) && <Alert severity="warning">{avisGrille(d.grille)}</Alert>}
    {!d.apporteurs.length && <Alert severity="info">
      Aucun apporteur d&apos;affaires pour l&apos;instant. Ajoutez-en un dans l&apos;onglet Réglages, ou importez les données du calculateur.
    </Alert>}

    <Card component="section" aria-label="Pilotage" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 2.25 }}>
        <Indicateur titre={vue === "tous" ? "Groupes" : `Groupes, ${nomCourt(libelleVue)}`} valeur={String(indic.groupes)}
          detail={`${indic.parStatut.installee} installé${indic.parStatut.installee > 1 ? "s" : ""}, ${indic.parStatut.validee} validé${indic.parStatut.validee > 1 ? "s" : ""}, ${indic.parStatut.envoyee} BC envoyé${indic.parStatut.envoyee > 1 ? "s" : ""}, ${indic.parStatut.prospect} prospect${indic.parStatut.prospect > 1 ? "s" : ""}`} />
        <Indicateur titre={`À la grille, en place, ${libelleMois(d.moisCourant)}`} valeur={euros(indic.courant.basePlace)}
          detail={`HT par mois, salles × prix de la grille, ${indic.courant.place.length} groupe${indic.courant.place.length > 1 ? "s" : ""} facturé${indic.courant.place.length > 1 ? "s" : ""}`} />
        <Indicateur titre="Taux du mois" valeur={<TauxDuMois moteur={moteur} vue={vue} />} detail={detailTaux(moteur, vue)} />
        <Indicateur titre="Commission du mois" valeur={euros(indic.courant.commissionPlace + indic.courant.commissionVenir)} accent
          detail={`HT, à facturer début ${libelleMois(ajouterMois(d.moisCourant, 1))}`} />
        <Indicateur titre="Prévision 12 mois" valeur={euros(indic.placeAnnee + indic.venirAnnee)}
          detail={<><Point couleur={TEINTES.menthe} />{euros(indic.placeAnnee)} en place, <Point couleur={TEINTES.orange} />{euros(indic.venirAnnee)} à venir</>} />
        <Indicateur titre="Factures" valeur={euros(indic.aEmettre)}
          detail={`TTC à émettre (${indic.aEmettreNombre}), ${euros(indic.aEncaisser)} à encaisser, ${euros(indic.encaisse)} encaissés`} />
      </Box>
    </Card>

    <Tabs value={onglet} onChange={(_, v: Onglet) => aller({ onglet: v === "groupes" ? null : v, groupe: null })} aria-label="Apport d'affaires"
      sx={{ "& .MuiTabs-flexContainer": { flexWrap: "wrap" } }}>
      {(Object.keys(ONGLETS) as Onglet[]).map((id) => <Tab key={id} value={id} id={`onglet-${id}`} aria-controls={`panneau-${id}`}
        label={id === "groupes" ? `${ONGLETS[id]} · ${indic.groupes}` : id === "factures" && indic.aEmettreNombre ? `${ONGLETS[id]} · ${indic.aEmettreNombre} à émettre` : ONGLETS[id]} />)}
    </Tabs>
    <Box role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`} sx={{ minWidth: 0 }}>
      {onglet === "groupes" && <OngletGroupes donnees={d} moteur={moteur} vue={vue} droits={droits} aller={aller} />}
      {onglet === "suivi" && <OngletSuivi donnees={d} moteur={moteur} vue={vue} />}
      {onglet === "factures" && <OngletFactures donnees={d} moteur={moteur} vue={vue} droits={droits} aller={aller} />}
      {onglet === "parametres" && <OngletParametres donnees={d} moteur={moteur} droits={droits} />}
    </Box>
  </Stack>;
}

function Indicateur({ titre, valeur, detail, accent }: { titre: string; valeur: ReactNode; detail: ReactNode; accent?: boolean }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="div" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>{titre}</Typography>
    <Box sx={{ fontSize: accent ? 26 : 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: accent ? "primary.main" : "text.primary", my: 0.25 }}>{valeur}</Box>
    <Typography component="div" sx={{ fontSize: 13, color: "text.secondary" }}>{detail}</Typography>
  </Box>;
}

export function Point({ couleur }: { couleur: string }) {
  return <Box component="span" aria-hidden sx={{ display: "inline-block", width: 9, height: 9, borderRadius: "2px", bgcolor: couleur, mr: 0.5, verticalAlign: "baseline" }} />;
}

function TauxDuMois({ moteur, vue }: { moteur: ReturnType<typeof creerMoteur>; vue: Vue }) {
  if (vue === "tous") return <Box component="span" sx={{ fontSize: 16 }}>par apporteur</Box>;
  if (!moteur.commissionne(vue)) return <Box component="span" sx={{ fontSize: 16 }}>sans commission</Box>;
  const courant = moteur.indicateurs(vue).courant;
  return <>{pourcentage(courant.tauxPlacePdm ?? 0)}<Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary", ml: 0.75 }}>palier {palierPour(courant.portefeuillePlace, moteur.parametres)}</Box></>;
}

function detailTaux(moteur: ReturnType<typeof creerMoteur>, vue: Vue): string {
  if (vue === "tous") {
    const l = moteur.tauxParApporteur().map((x) => `${nomCourt(x.apporteur.nom)} ${pourcentage(x.calcul.tauxPlacePdm ?? 0)}`);
    return l.join(", ") || "Aucun portefeuille en place";
  }
  if (!moteur.commissionne(vue)) return "Vente directe, non commissionnée";
  return `Portefeuille ${euros(moteur.indicateurs(vue).courant.portefeuillePlace)} HT`;
}

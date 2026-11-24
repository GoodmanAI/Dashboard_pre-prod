"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip,
  Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { IconCopy, IconExternalLink, IconFileDownload, IconPlus, IconPrinter, IconTrash, IconX } from "@tabler/icons-react";
import { euros } from "@/pilot/lib/argent";
import {
  ajouterJours, ajouterMoisAuJour, caducite, etatDecision, jourFr, libelleMois, offresDuSite, pourcentage, prixHt, sirenValide, statutCommande, versTtc,
  type Moteur,
} from "@/pilot/lib/apports/calcul";
import type { DonneesApports, GroupeDonnees, SiteDonnees } from "@/pilot/lib/apports/charger";
import {
  CATEGORIES, CLES_CATEGORIE, DECISIONS, ETAPES_COMMANDE, INVESTISSEURS, MODALITES, PERIMETRES, libelleModalite, risReconnu,
} from "@/pilot/lib/apports/referentiel";
import { ORIGINES } from "@/pilot/lib/organisations/referentielClient";
import { JETONS } from "@/pilot/jetons";
import type { Droits } from "./ApportsAffaires";
import { ChampEnLigne, ChampRis, EtatSauvegarde, nomCourt, PastilleDecision, PastilleStatut, urlDocument, useSauvegarde } from "./commun";
import { risDuGroupe } from "@/pilot/lib/apports/documents";
import { AIDE_ADRESSE } from "@/pilot/lib/carte/affichage";

const GRILLE = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px 16px" } as const;
const LARGE = { gridColumn: "1 / -1" } as const;

/** Un bouton qui demande une seconde pression pour agir, comme dans le calculateur. */
function useConfirmation() {
  const [arme, setArme] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(minuteur.current), []);
  return { arme, demander: (agir: () => void) => {
    if (arme) { clearTimeout(minuteur.current); setArme(false); agir(); return; }
    setArme(true); minuteur.current = setTimeout(() => setArme(false), 3500);
  } };
}

export function EditeurGroupe({ groupe: g, donnees: d, moteur, droits, fermer, ouvrir }: {
  groupe: GroupeDonnees; donnees: DonneesApports; moteur: Moteur; droits: Droits; fermer: () => void; ouvrir: (id: number) => void;
}) {
  const theme = useTheme(), plein = useMediaQuery(theme.breakpoints.down("sm"));
  const { enregistrer } = useSauvegarde();
  const retrait = useConfirmation();
  const ro = !droits.modifier;
  const url = `/api/pilot/apports/${g.id}`;
  const modifier = (champs: Record<string, unknown>) => enregistrer(url, "PATCH", { action: "modifier", champs });
  const agir = (action: string, extra: object = {}) => enregistrer<Record<string, number>>(url, "PATCH", { action, ...extra });
  const st = statutCommande(g), etape = ETAPES_COMMANDE.find((e) => e.cle === st)!;
  const c = moteur.calcul(g);

  return <Dialog open onClose={fermer} fullScreen={plein} fullWidth maxWidth="lg" scroll="paper" aria-labelledby={`titre-${g.id}`}>
    <DialogTitle id={`titre-${g.id}`} component="div" sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", py: 1.5, borderBottom: `1px solid ${JETONS.filet}` }}>
      <Typography variant="h2" component="h2" sx={{ flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}>{g.nom}</Typography>
      <PastilleStatut statut={st} date={etape.champ && g[etape.champ] ? jourFr(g[etape.champ]) : null} />
      <EtatSauvegarde />
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} sx={{ ml: "auto" }}>
        <Button size="small" component="a" href={urlDocument("fiche", { organisationId: g.id, telecharger: 1 })} startIcon={<IconFileDownload size={16} />}>Fiche Neuracorp (HTML)</Button>
        <Button size="small" variant="contained" component="a" href={urlDocument("fiche", { organisationId: g.id, imprimer: 1 })} target="_blank" rel="noopener" startIcon={<IconPrinter size={16} />}>Fiche Neuracorp (PDF)</Button>
        <Button size="small" component={Link} href={`/pilot/organisations/${g.id}`} startIcon={<IconExternalLink size={16} />}>Fiche client</Button>
        {!ro && <Button size="small" startIcon={<IconCopy size={16} />} onClick={async () => { const r = await agir("dupliquer"); if (r?.organisationId) ouvrir(r.organisationId); }}>Dupliquer</Button>}
        {!ro && <Button size="small" color="error" variant={retrait.arme ? "contained" : "text"} onClick={() => retrait.demander(async () => { if (await agir("retirer")) fermer(); })}>
          {retrait.arme ? "Confirmer le retrait" : "Retirer de l'apport"}</Button>}
        <IconButton aria-label="Fermer la fiche" onClick={fermer}><IconX size={20} /></IconButton>
      </Stack>
    </DialogTitle>
    <DialogContent sx={{ p: 0 }}>
      <Section fond={JETONS.accentFond}>
        <Box sx={{ ...GRILLE, alignItems: "center" }}>
          <ChampEnLigne label="Nom d'usage du groupe" valeur={g.nom} desactive={ro} enregistrer={(v) => v.trim() && modifier({ nom: v })} />
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} component="div">Validé pour tout le groupe</Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={0.5}>
              <Coche libelle="Talk" valeur={g.offreTalk} desactive={ro} changer={(v) => modifier({ offreTalk: v })} />
              <Coche libelle="Konnect" valeur={g.offreKonnect} desactive={ro} changer={(v) => modifier({ offreKonnect: v })} />
              <Coche libelle="Connecteur RIS" valeur={g.offreConnecteurRis} desactive={ro} changer={(v) => modifier({ offreConnecteurRis: v })} />
            </Stack>
          </Box>
          <ChampRis valeur={g.ris} label="RIS en place (groupe)" enregistrer={(v) => modifier({ ris: v })} />
        </Box>
      </Section>

      <Qualification g={g} d={d} moteur={moteur} ro={ro} modifier={modifier} agir={agir} />

      <Section titre="Parcours de commande">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 2 }}>
          {ETAPES_COMMANDE.map((e, i) => {
            const k = ETAPES_COMMANDE.findIndex((x) => x.cle === st), fait = i <= k;
            return <Stack key={e.cle} spacing={0.75} sx={{ minWidth: 0 }}>
              <Button disabled={ro} onClick={() => agir("etape", { statut: e.cle })} sx={{ justifyContent: "flex-start", gap: 1, px: 0.5, color: i === k ? "text.primary" : "text.secondary", fontWeight: 600, textAlign: "left", whiteSpace: "normal", minWidth: 0, lineHeight: 1.25 }}>
                <Box component="span" sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12,
                  bgcolor: fait ? "primary.main" : "background.paper", color: fait ? "common.white" : "text.secondary", border: `2px solid`, borderColor: fait ? "primary.main" : JETONS.filetChamp,
                  boxShadow: i === k ? `0 0 0 3px ${JETONS.accentAnneau}` : "none" }}>{i + 1}</Box>
                {e.libelle}
              </Button>
              {e.champ ? <ChampEnLigne size="small" type="date" label={`Date ${e.court}`} valeur={g[e.champ]} desactive={ro} enregistrer={(v) => modifier({ [e.champ!]: v })} />
                : <Typography variant="caption" color="text.secondary">{e.aide}</Typography>}
            </Stack>;
          })}
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>Le statut suit l&apos;étape la plus avancée dont la date est renseignée. Cliquer sur une étape antérieure efface les dates des étapes suivantes.</Typography>
        <Plan g={g} moteur={moteur} ro={ro} modifier={modifier} />
      </Section>

      <Section titre="Sites et salles">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Une offre cochée pour tout le groupe s&apos;applique à tous ses sites et ne se décoche plus site par site. Décochée au groupe, elle se coche sur chaque site.</Typography>
        <ChampEnLigne fullWidth multiligne label="Notes internes (non transmises)" placeholder="Historique, prochaines étapes, points d'attention" valeur={g.notes} desactive={ro}
          enregistrer={(v) => modifier({ notes: v })} sx={{ mb: 2 }} inputProps={{ maxLength: 4000 }} />
        <Stack spacing={1.5}>
          {g.sites.map((s, i) => <EditeurSite key={s.id} g={g} s={s} index={i} moteur={moteur} ro={ro} />)}
          {!g.sites.length && <Typography variant="body2" color="text.secondary">Aucun site dans ce groupe.</Typography>}
        </Stack>
        {!ro && <Button sx={{ mt: 1.5 }} variant="outlined" startIcon={<IconPlus size={18} />} onClick={() => agir("ajouterSite")}>Ajouter un site</Button>}
      </Section>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: JETONS.gris, fontSize: 13, color: "text.secondary" }}>
        <span>Sites actifs <b>{c.sitesActifs}</b></span>
        <span>Salles facturables <b>{c.sallesActives}</b></span>
        <span>À la grille <b>{euros(c.recurrent)}</b> HT par mois ({euros(versTtc(c.recurrent, moteur.parametres))} TTC)</span>
        <span>Connecteur RIS <b>{euros(c.connecteur)}</b> HT par mois</span>
        <span>Installation <b>{euros(c.installation)}</b> TTC</span>
        <span>Commission au taux actuel : {moteur.commissionActuelle(g).map((x) => <span key={x.apporteurId}>{nomCourt(moteur.apporteur(x.apporteurId)?.nom)} <b>{euros(x.commission)}</b> par mois{x.part < 100 ? ` (part ${x.part} %${x.tauxPdm ? `, taux ${pourcentage(x.tauxPdm)}` : ""})` : x.tauxPdm ? ` (taux ${pourcentage(x.tauxPdm)})` : ""} </span>)}</span>
      </Box>
    </DialogContent>
  </Dialog>;
}

function Section({ titre, fond, children, entete }: { titre?: string; fond?: string; children: ReactNode; entete?: ReactNode }) {
  return <Box component="section" sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: `1px solid ${JETONS.filet}`, bgcolor: fond }}>
    {titre && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center" sx={{ mb: 1.5 }}><Typography variant="h3" component="h3">{titre}</Typography>{entete}</Stack>}
    {children}
  </Box>;
}

function Coche({ libelle, valeur, changer, desactive, aide }: { libelle: string; valeur: boolean; changer: (v: boolean) => void; desactive?: boolean; aide?: string }) {
  const coche = <FormControlLabel label={libelle} disabled={desactive} sx={{ mr: 1.5 }}
    control={<Checkbox size="small" checked={valeur} onChange={(e) => changer(e.target.checked)} />} />;
  return aide ? <Tooltip title={aide}><span>{coche}</span></Tooltip> : coche;
}

type Modifier = (champs: Record<string, unknown>) => Promise<unknown>;
type Agir = (action: string, extra?: object) => Promise<Record<string, number> | null>;

function Qualification({ g, d, moteur, ro, modifier, agir }: { g: GroupeDonnees; d: DonneesApports; moteur: Moteur; ro: boolean; modifier: Modifier; agir: Agir }) {
  const { enregistrer } = useSauvegarde();
  const siren = sirenValide(g.siren), cad = caducite(g), principal = moteur.principal(g), co = moteur.partCo(g);
  const investisseurConnu = !g.investisseur || (INVESTISSEURS as readonly string[]).includes(g.investisseur);
  const [autreInvestisseur, setAutreInvestisseur] = useState(!investisseurConnu);
  const [nouveauContact, setNouveauContact] = useState("");
  const ris = [...new Set(risDuGroupe(g).map((r) => risReconnu(r) ?? r))];
  const types = d.parametres.typesPrestataires;
  const origineConnue = !g.origine || Object.hasOwn(ORIGINES, g.origine);
  const caduciteAide = g.signaleLe && !g.decisionLe ? `Réponse attendue avant le ${jourFr(ajouterJours(g.signaleLe, 7))}, faute de quoi le prospect est réputé refusé.`
    : g.bcEnvoyeLe && cad && cad === ajouterMoisAuJour(g.bcEnvoyeLe, 12) ? `Prorogée de 12 mois par l'envoi du bon de commande le ${jourFr(g.bcEnvoyeLe)}.` : "";

  return <Section titre="Qualification du prospect" entete={<>
    <Typography variant="caption" color="text.secondary">Annexe 2 et article 3 du contrat d&apos;apporteur d&apos;affaires</Typography>
    <PastilleDecision etat={etatDecision(g, d.aujourdhui)} />
  </>}>
    <Stack spacing={2}>
      <Box sx={GRILLE}>
        <TextField select size="small" label="Apporteur d'affaires" value={principal || ""} disabled={ro} onChange={(e) => modifier({ apporteurId: Number(e.target.value) })}>
          {d.apporteurs.map((a) => <MenuItem key={a.id} value={a.id}>{a.nom}{a.structure ? ` (${a.structure})` : ""}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Co-apporteur (apport partagé, art. 3.5)" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={g.coApporteurId && g.coApporteurId !== principal ? g.coApporteurId : ""} disabled={ro}
          onChange={(e) => modifier({ coApporteurId: e.target.value ? Number(e.target.value) : null })}>
          <MenuItem value=""><em>Aucun</em></MenuItem>
          {d.apporteurs.filter((a) => a.id !== principal).map((a) => <MenuItem key={a.id} value={a.id}>{a.nom}</MenuItem>)}
        </TextField>
        {g.coApporteurId && g.coApporteurId !== principal ? <ChampEnLigne size="small" type="number" label="Part du co-apporteur, %" valeur={String(co)} desactive={ro}
          inputProps={{ min: 0, max: 100, step: 5 }} enregistrer={(v) => modifier({ coApporteurPart: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) })}
          helperText={`${nomCourt(moteur.apporteur(principal)?.nom)} ${100 - co} %, ${nomCourt(moteur.apporteur(g.coApporteurId)?.nom)} ${co} %. Chacun au taux de son propre portefeuille.`} /> : null}
      </Box>
      <Box sx={GRILLE}>
        <ChampEnLigne size="small" label="Dénomination sociale" placeholder="Raison sociale exacte" valeur={g.denominationSociale} desactive={ro} enregistrer={(v) => modifier({ denominationSociale: v })} />
        <ChampEnLigne size="small" label="Numéro SIREN" placeholder="9 chiffres" valeur={g.siren} desactive={ro} inputProps={{ inputMode: "numeric", maxLength: 11 }}
          enregistrer={(v) => modifier({ siren: v })} error={siren === false}
          helperText={siren === false ? "Numéro SIREN invalide" : siren ? "Numéro SIREN valide" : " "} />
        <ChampEnLigne size="small" label="Adresse du siège" valeur={g.adresseSiege} desactive={ro} enregistrer={(v) => modifier({ adresseSiege: v })} />
        <TextField select size="small" label="Type de groupe" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={g.categorie ?? ""} disabled={ro} onChange={(e) => modifier({ categorie: e.target.value })}>
          <MenuItem value=""><em>Choisir</em></MenuItem>
          {CLES_CATEGORIE.map((k) => <MenuItem key={k} value={k}>{CATEGORIES[k]}</MenuItem>)}
        </TextField>
        {g.categorie === "investisseur" ? <>
          <TextField select size="small" label="Investisseur" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={autreInvestisseur ? "AUTRE" : g.investisseur ?? ""} disabled={ro}
            onChange={(e) => { if (e.target.value === "AUTRE") { setAutreInvestisseur(true); return; } setAutreInvestisseur(false); modifier({ investisseur: e.target.value }); }}>
            <MenuItem value=""><em>Choisir</em></MenuItem>
            {INVESTISSEURS.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            <MenuItem value="AUTRE">Autre</MenuItem>
          </TextField>
          {autreInvestisseur && <ChampEnLigne size="small" label="Nom de l'investisseur" valeur={investisseurConnu ? "" : g.investisseur} desactive={ro} enregistrer={(v) => modifier({ investisseur: v })} />}
        </> : g.categorie ? <ChampEnLigne size="small" label="Précision" placeholder={g.categorie === "independant" ? "SELAS, GIE, réseau" : "Établissement, GHT"}
          valeur={g.precisionCategorie} desactive={ro} enregistrer={(v) => modifier({ precisionCategorie: v })} /> : null}
        <ChampEnLigne size="small" type="date" label="Date du signalement" valeur={g.signaleLe} desactive={ro} enregistrer={(v) => modifier({ signaleLe: v })} />
        <TextField select size="small" label="Origine du contact" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={g.origine ?? ""} disabled={ro} onChange={(e) => modifier({ origine: e.target.value })}>
          <MenuItem value=""><em>Non renseignée</em></MenuItem>
          {Object.entries(ORIGINES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          {!origineConnue && <MenuItem value={g.origine!}>{g.origine}</MenuItem>}
        </TextField>
      </Box>

      <Box sx={{ border: `1px solid ${JETONS.filet}`, borderRadius: "12px", p: 1.5, bgcolor: JETONS.gris }}>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ mb: 1.25 }}>
          <Typography fontWeight={600} fontSize={14}>Éditeur du RIS en place</Typography>
          <Chip size="small" color={ris.length ? "info" : "default"} label={ris.length ? ris.join(", ") : "RIS non renseigné"} />
          <Typography variant="caption" color="text.secondary">Le RIS se choisit en haut de la fiche et sur chaque site.</Typography>
        </Stack>
        <Box sx={{ ...GRILLE, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <ChampEnLigne size="small" label="Code client chez l'éditeur" valeur={g.risCodeClient} desactive={ro} inputProps={{ maxLength: 60 }} enregistrer={(v) => modifier({ risCodeClient: v })} />
          <ChampEnLigne size="small" label="Codes de site chez l'éditeur" placeholder="Un code par site, séparés par ;" valeur={g.risCodesSites} desactive={ro} inputProps={{ maxLength: 200 }} enregistrer={(v) => modifier({ risCodesSites: v })} />
          <ChampEnLigne size="small" label="Nom du commercial" valeur={g.risCommercial} desactive={ro} inputProps={{ maxLength: 80 }} enregistrer={(v) => modifier({ risCommercial: v })} />
          <ChampEnLigne size="small" type="tel" label="Téléphone" valeur={g.risCommercialTelephone} desactive={ro} inputProps={{ maxLength: 30 }} enregistrer={(v) => modifier({ risCommercialTelephone: v })} />
          <ChampEnLigne size="small" type="email" label="Email" valeur={g.risCommercialEmail} desactive={ro} inputProps={{ maxLength: 120 }} enregistrer={(v) => modifier({ risCommercialEmail: v })} />
        </Box>
      </Box>

      <ChampEnLigne fullWidth multiligne size="small" label="Nature du besoin identifié" placeholder="Accueil téléphonique saturé, prise de rendez-vous en ligne, préqualification"
        valeur={g.besoin} desactive={ro} inputProps={{ maxLength: 2000 }} enregistrer={(v) => modifier({ besoin: v })} />

      <Box>
        <Typography fontWeight={600} fontSize={14} sx={{ mb: 1 }}>Interlocuteurs et coordonnées</Typography>
        <Stack spacing={1}>
          {g.contacts.map((ct) => <LigneContact key={ct.id} contact={ct} ro={ro} />)}
          {!g.contacts.length && <Typography variant="body2" color="text.secondary">Aucun interlocuteur renseigné.</Typography>}
        </Stack>
        {!ro && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mt: 1 }} component="form"
          onSubmit={async (e) => { e.preventDefault(); const nom = nouveauContact.trim(); if (!nom) return;
            if (await enregistrer("/api/pilot/contacts", "POST", { organisationId: g.id, nom, principal: !g.contacts.length })) setNouveauContact(""); }}>
          <TextField size="small" label="Nom du nouvel interlocuteur" value={nouveauContact} onChange={(e) => setNouveauContact(e.target.value)} sx={{ flex: "1 1 220px", maxWidth: 360 }} />
          <Button type="submit" startIcon={<IconPlus size={18} />} disabled={!nouveauContact.trim()}>Ajouter un interlocuteur</Button>
        </Stack>}
      </Box>

      <Box>
        <Typography fontWeight={600} fontSize={14} sx={{ mb: 1 }}>Prestataires</Typography>
        <Stack spacing={1}>
          {g.prestataires.map((p) => <LignePrestataire key={p.id} p={p} types={types} ro={ro} />)}
          {!g.prestataires.length && <Typography variant="body2" color="text.secondary">Aucun prestataire renseigné (DSI, informatique, téléphonie).</Typography>}
        </Stack>
        {!ro && <Button sx={{ mt: 1 }} startIcon={<IconPlus size={18} />} onClick={() => agir("ajouterPrestataire")}>Ajouter un prestataire</Button>}
      </Box>

      <Box sx={GRILLE}>
        <TextField select size="small" label="Périmètre de validation (art. 3.4)" value={g.perimetre} disabled={ro} onChange={(e) => modifier({ perimetre: e.target.value })}>
          {Object.entries(PERIMETRES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Décision de Neuracorp AI" value={g.decision} disabled={ro} onChange={(e) => modifier({ decision: e.target.value })}>
          {Object.entries(DECISIONS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <ChampEnLigne size="small" type="date" label="Date de la décision" valeur={g.decisionLe} desactive={ro} enregistrer={(v) => modifier({ decisionLe: v })} />
        <ChampEnLigne size="small" type="date" label="Date envisagée du déploiement" valeur={g.deploiementPrevuLe} desactive={ro} enregistrer={(v) => modifier({ deploiementPrevuLe: v })} />
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">Date de caducité (12 mois, art. 3.3)</Typography>
          <Typography fontWeight={600}>{cad ? jourFr(cad) : "Après validation"}</Typography>
          {caduciteAide && <Typography variant="caption" color="text.secondary">{caduciteAide}</Typography>}
        </Box>
        <ChampEnLigne size="small" multiligne label="Observations" valeur={g.observations} desactive={ro} inputProps={{ maxLength: 2000 }} enregistrer={(v) => modifier({ observations: v })} sx={LARGE} />
      </Box>
    </Stack>
  </Section>;
}

function LigneContact({ contact: c, ro }: { contact: GroupeDonnees["contacts"][number]; ro: boolean }) {
  const { enregistrer } = useSauvegarde();
  const suppression = useConfirmation();
  const maj = (champ: string, v: string) => enregistrer(`/api/pilot/contacts/${c.id}`, "PATCH", { [champ]: v });
  return <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr)) auto", gap: 1, alignItems: "center" }}>
    <ChampEnLigne size="small" label="Nom" valeur={c.nom} desactive={ro} enregistrer={(v) => v.trim() && maj("nom", v)} />
    <ChampEnLigne size="small" label="Fonction" valeur={c.fonction} desactive={ro} enregistrer={(v) => maj("fonction", v)} />
    <ChampEnLigne size="small" type="tel" label="Téléphone" valeur={c.telephone} desactive={ro} enregistrer={(v) => maj("telephone", v)} />
    <ChampEnLigne size="small" type="email" label="Email" valeur={c.email} desactive={ro} enregistrer={(v) => maj("email", v)} />
    {!ro && <Tooltip title={suppression.arme ? "Confirmer la suppression" : "Retirer l'interlocuteur"}>
      <IconButton aria-label={`Retirer ${c.nom}`} color={suppression.arme ? "error" : "default"} onClick={() => suppression.demander(() => enregistrer(`/api/pilot/contacts/${c.id}`, "DELETE"))}><IconTrash size={18} /></IconButton>
    </Tooltip>}
  </Box>;
}

function LignePrestataire({ p, types, ro }: { p: GroupeDonnees["prestataires"][number]; types: string[]; ro: boolean }) {
  const { enregistrer } = useSauvegarde();
  const url = `/api/pilot/apports/prestataires/${p.id}`;
  const maj = (champ: string, v: string) => enregistrer(url, "PATCH", { [champ]: v });
  const options = p.type && !types.includes(p.type) ? [p.type, ...types] : types;
  return <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr)) auto", gap: 1, alignItems: "center", pb: 1, borderBottom: `1px solid ${JETONS.filetInterne}` }}>
    <TextField select size="small" label="Type" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={p.type ?? ""} disabled={ro} onChange={(e) => maj("type", e.target.value)}>
      <MenuItem value=""><em>Type</em></MenuItem>
      {options.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
    </TextField>
    <ChampEnLigne size="small" label="Société" valeur={p.societe} desactive={ro} enregistrer={(v) => maj("societe", v)} />
    <ChampEnLigne size="small" label="Contact, nom et prénom" valeur={p.nom} desactive={ro} enregistrer={(v) => maj("nom", v)} />
    <ChampEnLigne size="small" type="tel" label="Téléphone" valeur={p.telephone} desactive={ro} enregistrer={(v) => maj("telephone", v)} />
    <ChampEnLigne size="small" type="email" label="Email" valeur={p.email} desactive={ro} enregistrer={(v) => maj("email", v)} />
    <ChampEnLigne size="small" label="Commentaire" valeur={p.commentaire} desactive={ro} enregistrer={(v) => maj("commentaire", v)} />
    {!ro && <IconButton aria-label="Retirer le prestataire" onClick={() => enregistrer(url, "DELETE")}><IconTrash size={18} /></IconButton>}
  </Box>;
}

function Plan({ g, moteur, ro, modifier }: { g: GroupeDonnees; moteur: Moteur; ro: boolean; modifier: Modifier }) {
  const s = moteur.calendrier(g);
  return <Box sx={{ mt: 2, p: 1.5, borderRadius: "12px", bgcolor: JETONS.gris, fontSize: 14 }}>
    {g.commandeInstalleeLe
      ? <Typography fontSize={14}>Prévisionnel basé sur la date de commande installée, le <b>{jourFr(g.commandeInstalleeLe)}</b>. Premier mois encaissé : <b>{s ? libelleMois(s.debut, true) : "à déterminer"}</b>{s?.fin ? `, commissionné jusqu'en ${libelleMois(s.fin, true)}` : ""}.</Typography>
      : <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5} alignItems="center">
        <ChampEnLigne size="small" type="date" label="Installation prévue le" valeur={g.deploiementPrevuLe} desactive={ro} enregistrer={(v) => modifier({ deploiementPrevuLe: v })} sx={{ width: 200 }} />
        <Typography fontSize={14} sx={{ flex: "1 1 260px" }}>
          {s ? <>Prévisionnel basé sur la date prévue d&apos;installation : premier encaissement en <b>{libelleMois(s.debut, true)}</b>{s.reporte && <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}> (date prévue dépassée, reportée au mois en cours)</Box>}</>
            : g.deploiementPrevuLe ? "Ce statut n'entre pas dans le prévisionnel (voir Réglages)." : "Sans date prévue, le groupe n'apparaît pas dans le prévisionnel."}
        </Typography>
      </Stack>}
  </Box>;
}

function EditeurSite({ g, s, index, moteur, ro }: { g: GroupeDonnees; s: SiteDonnees; index: number; moteur: Moteur; ro: boolean }) {
  const { enregistrer } = useSauvegarde();
  const suppression = useConfirmation();
  const [nombre, setNombre] = useState("1");
  const [modalite, setModalite] = useState("RX");
  const url = `/api/pilot/apports/sites/${s.id}`;
  const modifier = (champs: Record<string, unknown>) => enregistrer(url, "PATCH", { action: "modifier", champs });
  const o = offresDuSite(s, g), n = s.salles.length, actif = n > 0 && (o.talk || o.konnect);
  const u = prixHt(moteur.parametres), recurrent = n * ((o.talk ? u.talk : 0) + (o.konnect ? u.konnect : 0));
  const parModalite = new Map<string, number>();
  for (const r of s.salles) parModalite.set(r.modalite, (parModalite.get(r.modalite) ?? 0) + 1);
  const principal = g.sites[0];
  const heritage = index > 0 && principal?.ris ? `Comme le site principal (${risReconnu(principal.ris) ?? principal.ris})` : g.ris ? `Comme le groupe (${risReconnu(g.ris) ?? g.ris})` : "Non renseigné";
  const ajouter = () => enregistrer(url, "PATCH", { action: "ajouterSalles", nombre: Math.max(1, Math.min(99, Number(nombre) || 1)), modalite });

  return <Box sx={{ border: `1px solid ${JETONS.filet}`, borderRadius: "14px", p: 1.75, bgcolor: actif ? "background.paper" : JETONS.gris }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
      <ChampEnLigne size="small" label="Nom du site" valeur={s.nom} desactive={ro} enregistrer={(v) => v.trim() && modifier({ nom: v })} sx={{ flex: "1 1 200px", minWidth: 0 }} />
      <Stack direction="row" flexWrap="wrap" useFlexGap>
        <Coche libelle="Talk" valeur={o.talk} desactive={ro || g.offreTalk} aide={g.offreTalk ? "Validé pour tout le groupe" : undefined} changer={(v) => modifier({ offreTalk: v })} />
        <Coche libelle="Konnect" valeur={o.konnect} desactive={ro || g.offreKonnect} aide={g.offreKonnect ? "Validé pour tout le groupe" : undefined} changer={(v) => modifier({ offreKonnect: v })} />
        <Coche libelle="Connecteur RIS" valeur={o.ris} desactive={ro || g.offreConnecteurRis} aide={g.offreConnecteurRis ? "Validé pour tout le groupe" : undefined} changer={(v) => modifier({ offreConnecteurRis: v })} />
      </Stack>
      <Typography fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{n} salle{n > 1 ? "s" : ""} · {euros(recurrent)} HT / mois</Typography>
      {!ro && <Stack direction="row" sx={{ ml: "auto" }}>
        <Button size="small" onClick={() => enregistrer(url, "PATCH", { action: "dupliquer" })}>Dupliquer</Button>
        <Tooltip title={s.lie ? "Ce site est suivi ailleurs dans Pilot : il se gère depuis la fiche client." : ""}>
          <span><Button size="small" color="error" disabled={s.lie} variant={suppression.arme ? "contained" : "text"} onClick={() => suppression.demander(() => enregistrer(url, "DELETE"))}>
            {suppression.arme ? "Confirmer" : "Supprimer"}</Button></span>
        </Tooltip>
      </Stack>}
    </Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 2fr) minmax(0, 1fr)" }, gap: 1.5, mt: 1.5 }}>
      <ChampEnLigne size="small" label="Localisation (adresse, code postal, ville)" valeur={s.adresse} desactive={ro} inputProps={{ maxLength: 300 }} helperText={AIDE_ADRESSE} enregistrer={(v) => modifier({ adresse: v })} />
      <ChampRis valeur={s.ris} libelleVide={heritage} enregistrer={(v) => modifier({ ris: v })} />
    </Box>
    {parModalite.size > 0 && <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} sx={{ mt: 1.25 }}>
      {[...parModalite].map(([m, q]) => <Chip key={m} size="small" variant="outlined" label={`${q} × ${libelleModalite(m)}`} />)}
    </Stack>}
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1, mt: 1.25 }}>
      {s.salles.map((r) => <Salle key={r.id} salle={r} ro={ro} />)}
      {!n && <Typography variant="body2" color="text.secondary">Aucune salle. Ajoutez les salles de ce site ci-dessous.</Typography>}
    </Box>
    {!ro && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ mt: 1.25 }} component="form" onSubmit={(e) => { e.preventDefault(); void ajouter(); }}>
      <Typography variant="body2" color="text.secondary">Ajouter</Typography>
      <TextField size="small" type="number" value={nombre} onChange={(e) => setNombre(e.target.value)} inputProps={{ min: 1, max: 99, "aria-label": "Nombre de salles" }} sx={{ width: 80 }} />
      <Typography variant="body2" color="text.secondary">salle(s) en</Typography>
      <TextField select size="small" value={modalite} onChange={(e) => setModalite(e.target.value)} inputProps={{ "aria-label": "Modalité des salles à ajouter" }} sx={{ flex: "1 1 220px", maxWidth: 340 }}>
        {MODALITES.map((m, i) => <MenuItem key={m.code} value={m.code}>{i + 1}. {m.libelle}</MenuItem>)}
      </TextField>
      <Button type="submit" variant="outlined">Ajouter</Button>
    </Stack>}
    {!actif && n > 0 && <Alert severity="info" icon={false} sx={{ mt: 1.25 }}>Ni Talk ni Konnect validés : ce site n&apos;entre pas dans le calcul.</Alert>}
  </Box>;
}

function Salle({ salle: r, ro }: { salle: SiteDonnees["salles"][number]; ro: boolean }) {
  const { enregistrer } = useSauvegarde();
  const url = `/api/pilot/apports/salles/${r.id}`;
  return <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
    <ChampEnLigne size="small" valeur={r.libelle} desactive={ro} inputProps={{ maxLength: 60, "aria-label": "Nom de la salle" }} enregistrer={(v) => v.trim() && enregistrer(url, "PATCH", { libelle: v })} sx={{ width: 100, flexShrink: 0 }} />
    <TextField select size="small" value={r.modalite} disabled={ro} onChange={(e) => enregistrer(url, "PATCH", { modalite: e.target.value })} inputProps={{ "aria-label": "Modalité" }} sx={{ flex: 1, minWidth: 0 }}>
      {MODALITES.map((m, i) => <MenuItem key={m.code} value={m.code}>{i + 1}. {m.libelle}</MenuItem>)}
    </TextField>
    {!ro && <IconButton size="small" aria-label="Supprimer la salle" onClick={() => enregistrer(url, "DELETE")}><IconTrash size={16} /></IconButton>}
  </Stack>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert, Box, Button, Card, Chip, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from "@mui/material";
import { IconPlus, IconPrinter, IconFileDownload, IconEye, IconEyeOff } from "@tabler/icons-react";
import { Bloc } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { euros } from "@/pilot/lib/argent";
import { jourFr, libelleMois, pourcentage, statutCommande, syntheseModalites, etatDecision, type Moteur, type Vue } from "@/pilot/lib/apports/calcul";
import type { DonneesApports, GroupeDonnees } from "@/pilot/lib/apports/charger";
import { filtrerGroupes, libelleCategorie, risDuSite } from "@/pilot/lib/apports/documents";
import { de, ETAPES_COMMANDE, libelleModalite, MODALITES, risReconnu, type StatutCommande } from "@/pilot/lib/apports/referentiel";
import { JETONS, TEINTES } from "@/pilot/jetons";
import type { Droits } from "./ApportsAffaires";
import { nomCourt, PastilleDecision, PastilleStatut, urlDocument } from "./commun";
import { EditeurGroupe } from "./EditeurGroupe";

const SECONDAIRE = { display: { xs: "none", lg: "table-cell" } };
const MOYENNE = { display: { xs: "none", md: "table-cell" } };
const PETITE = { display: { xs: "none", sm: "table-cell" } };
const TABLEAU = { tableLayout: "fixed", "& td, & th": { px: { xs: 1, sm: 1.25 }, overflowWrap: "anywhere", fontSize: 13 },
  "& th": { fontSize: 12, overflowWrap: "normal", hyphens: "auto" } } as const;

export function OngletGroupes({ donnees: d, moteur, vue, droits, aller }: {
  donnees: DonneesApports; moteur: Moteur; vue: Vue; droits: Droits; aller: (c: Record<string, string | null>) => void;
}) {
  const recherche = useSearchParams()!;
  const statutBrut = recherche.get("statut");
  const statut: "all" | StatutCommande = ETAPES_COMMANDE.some((e) => e.cle === statutBrut) ? statutBrut as StatutCommande : "all";
  const [texte, setTexte] = useState("");
  const [masques, setMasques] = useState(false);
  const [creation, setCreation] = useState(false);
  useEffect(() => { try { setMasques(localStorage.getItem("pilot-apports-masques") === "1"); } catch { /* stockage indisponible */ } }, []);
  function basculerMasques() {
    setMasques((m) => { try { localStorage.setItem("pilot-apports-masques", m ? "0" : "1"); } catch { /* idem */ } return !m; });
  }
  const trouves = useMemo(() => filtrerGroupes(d, moteur, vue, { statut: "all", recherche: texte }).trouves, [d, moteur, vue, texte]);
  const affiches = statut === "all" ? trouves : trouves.filter((g) => statutCommande(g) === statut);
  const compte = (s: StatutCommande) => trouves.filter((g) => statutCommande(g) === s).length;
  const ouvert = d.groupes.find((g) => String(g.id) === recherche.get("groupe"));
  const visibles = d.groupes.filter((g) => moteur.dansVue(g, vue));
  const docParams = { apporteur: vue === "tous" ? "tous" : vue, statut, q: texte.trim() || undefined };

  return <Stack spacing={2.5}>
    <Card sx={{ p: { xs: 2, sm: 2.5 } }}><Jauge moteur={moteur} vue={vue} /></Card>

    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} role="group" aria-label="Filtrer par statut">
      <Filtre actif={statut === "all"} onClick={() => aller({ statut: null })} libelle="Tous" nombre={trouves.length} />
      {ETAPES_COMMANDE.map((e) => <Filtre key={e.cle} actif={statut === e.cle} onClick={() => aller({ statut: e.cle })} libelle={e.libelle} nombre={compte(e.cle)} />)}
    </Stack>

    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center">
      <TextField size="small" type="search" placeholder="Rechercher un groupe" value={texte} onChange={(e) => { setTexte(e.target.value); if (e.target.value) setMasques(false); }}
        inputProps={{ "aria-label": "Rechercher un groupe" }} title="Nom, site, type, investisseur, RIS, prestataire ou notes" sx={{ flex: "1 1 220px", maxWidth: 340 }} />
      <Button onClick={basculerMasques} aria-pressed={masques} startIcon={masques ? <IconEye size={18} /> : <IconEyeOff size={18} />}>{masques ? "Afficher les groupes" : "Masquer les groupes"}</Button>
      {droits.modifier && <Button variant="contained" startIcon={<IconPlus size={18} />} onClick={() => setCreation(true)} disabled={!d.apporteurs.length}>Ajouter un groupe</Button>}
      <Box sx={{ ml: { md: "auto" }, display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button component="a" href={urlDocument("synthese-groupes", { ...docParams, telecharger: 1 })} startIcon={<IconFileDownload size={18} />}>Synthèse (HTML)</Button>
        <Button component="a" href={urlDocument("synthese-groupes", { ...docParams, imprimer: 1 })} target="_blank" rel="noopener" startIcon={<IconPrinter size={18} />}>Imprimer ou PDF</Button>
      </Box>
    </Stack>

    {masques ? <Typography variant="body2" color="text.secondary">{affiches.length} groupe{affiches.length > 1 ? "s" : ""} masqué{affiches.length > 1 ? "s" : ""}. Cliquez sur « Afficher les groupes » pour les retrouver.</Typography>
      : affiches.length ? <Card>
        <Table size="small" sx={TABLEAU}>
          <TableHead><TableRow>
            <TableCell sx={{ width: { xs: "auto", md: "26%" } }}>Groupe</TableCell>
            <TableCell sx={{ width: 120 }}>Statut</TableCell>
            <TableCell sx={MOYENNE}>Apporteur</TableCell>
            <TableCell sx={PETITE}>Décision</TableCell>
            <TableCell align="right" sx={{ ...SECONDAIRE, width: 56 }}>Sites</TableCell>
            <TableCell align="right" sx={{ ...SECONDAIRE, width: 60 }}>Salles</TableCell>
            <TableCell sx={SECONDAIRE}>Offres</TableCell>
            <TableCell sx={SECONDAIRE}>1er encaissement</TableCell>
            <TableCell align="right" sx={{ width: { xs: 96, sm: 120 } }}>À la grille HT / mois</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {affiches.map((g) => <LigneGroupe key={g.id} g={g} moteur={moteur} vue={vue} aujourdhui={d.aujourdhui} ouvrir={() => aller({ groupe: String(g.id) })} />)}
          </TableBody>
        </Table>
      </Card>
      : <Card sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h2" sx={{ mb: 1 }}>{!visibles.length ? "Aucun groupe enregistré" : texte ? "Aucun groupe ne correspond à la recherche" : "Aucun groupe dans ce statut"}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Ajoutez un groupe de radiologie, décrivez ses sites et ses salles, puis faites avancer sa commande du prospect à l&apos;installation.</Typography>
        {droits.modifier && d.apporteurs.length > 0 && <Button variant="contained" onClick={() => setCreation(true)}>Ajouter un groupe</Button>}
      </Card>}

    <Bloc titre={`Synthèse des sites et des salles, ${vue === "tous" ? "tous groupes" : moteur.apporteur(vue)?.nom ?? ""}`}>
      <Box sx={{ px: { xs: 1, sm: 2 }, pb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 1, mb: 1 }}>Hors offre : sites sans Talk ni Konnect, ou sans salle.</Typography>
        <TableauModalites groupes={visibles} />
      </Box>
    </Bloc>

    {creation && <CreationGroupe donnees={d} moteur={moteur} vue={vue} fermer={() => setCreation(false)} ouvrir={(id) => { setCreation(false); aller({ groupe: String(id), statut: null }); }} />}
    {ouvert && <EditeurGroupe key={ouvert.id} groupe={ouvert} donnees={d} moteur={moteur} droits={droits} fermer={() => aller({ groupe: null })} ouvrir={(id) => aller({ groupe: String(id) })} />}
  </Stack>;
}

function Filtre({ actif, onClick, libelle, nombre }: { actif: boolean; onClick: () => void; libelle: string; nombre: number }) {
  return <Button onClick={onClick} aria-pressed={actif} variant={actif ? "contained" : "outlined"} size="small" sx={{ borderRadius: 999 }}>
    {libelle}<Box component="span" sx={{ ml: 0.75, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{nombre}</Box>
  </Button>;
}

function LigneGroupe({ g, moteur, vue, aujourdhui, ouvrir }: { g: GroupeDonnees; moteur: Moteur; vue: Vue; aujourdhui: string; ouvrir: () => void }) {
  const st = statutCommande(g), e = ETAPES_COMMANDE.find((x) => x.cle === st)!, cal = moteur.calendrier(g), o = moteur.resumeOffres(g), c = moteur.calcul(g);
  const date = e.champ ? g[e.champ] : null;
  const sous = [g.denominationSociale && g.denominationSociale !== g.nom ? g.denominationSociale : "", libelleCategorie(g)].filter(Boolean).join(" · ");
  const part = vue === "tous" ? 100 : moteur.part(g, vue), co = moteur.partCo(g);
  const brut = g.sites.length ? risDuSite(g, g.sites[0]) : g.ris, ris = brut ? risReconnu(brut) ?? brut : null;
  return <TableRow hover tabIndex={0} onClick={ouvrir} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); } }}
    sx={{ cursor: "pointer" }} aria-label={`Ouvrir ${g.nom}`}>
    <TableCell><Typography fontWeight={600} fontSize={14}>{g.nom}</Typography>{sous && <Typography variant="caption" color="text.secondary" component="div">{sous}</Typography>}</TableCell>
    <TableCell><PastilleStatut statut={st} court />{date && <Typography variant="caption" color="text.secondary" component="div">{jourFr(date)}</Typography>}</TableCell>
    <TableCell sx={MOYENNE}>{nomCourt(moteur.apporteur(moteur.principal(g))?.nom)}
      {co > 0 && <Typography variant="caption" color="text.secondary" component="div">avec {nomCourt(moteur.apporteur(g.coApporteurId!)?.nom)}, {100 - co} / {co} %</Typography>}</TableCell>
    <TableCell sx={PETITE}><PastilleDecision etat={etatDecision(g, aujourdhui)} /></TableCell>
    <TableCell align="right" sx={SECONDAIRE}>{o.sites}</TableCell>
    <TableCell align="right" sx={SECONDAIRE}>{o.salles}</TableCell>
    <TableCell sx={SECONDAIRE}>
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
        {o.talk !== "Non" && <Chip size="small" color="success" label="T" title="Talk" />}
        {o.konnect !== "Non" && <Chip size="small" color="info" label="K" title="Konnect" />}
        {o.connecteur !== "Non" && <Chip size="small" color="warning" label="RIS" title="Connecteur RIS" />}
      </Stack>
      {ris && <Typography variant="caption" color="text.secondary" component="div">{ris}</Typography>}
    </TableCell>
    <TableCell sx={SECONDAIRE}>{cal ? (cal.nature === "place" ? libelleMois(cal.debut) : `prévu ${libelleMois(cal.debut)}`) : ""}</TableCell>
    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
      {euros(Math.round(c.recurrent * part / 100))}
      {part < 100 && <Typography variant="caption" color="text.secondary" component="div">sur {euros(c.recurrent)}</Typography>}
    </TableCell>
  </TableRow>;
}

/** Position dans la grille de commissionnement, et ce qui manque pour le palier suivant. */
function Jauge({ moteur, vue }: { moteur: Moteur; vue: Vue }) {
  const j = moteur.jauge(vue), p = moteur.parametres;
  const nom = moteur.apporteur(j.apporteurId)?.nom ?? "l'apporteur";
  if (!j.commissionne) return <>
    <Typography variant="caption" color="text.secondary" fontWeight={600}>Position dans la grille de commissionnement</Typography>
    <Typography variant="body2" color="text.secondary">{nom} n&apos;est pas commissionné : pas de palier à suivre.</Typography>
  </>;
  // Des blocs placés en pourcentage plutôt qu'un SVG étiré : le texte reste net à toutes les largeurs.
  const max = Math.max(p.seuil2Centimes * 1.6, j.pipe * 1.12, 1), x = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const x1 = x(p.seuil1Centimes), x2 = x(p.seuil2Centimes);
  const bande = (gauche: number, largeur: number, couleur: string, opacite = 1) => <Box sx={{ position: "absolute", top: 0, bottom: 0, left: `${gauche}%`, width: `${largeur}%`, bgcolor: couleur, opacity: opacite }} />;
  const etiquette = (gauche: number, haut: number, texte: string) => <Box component="span" sx={{ position: "absolute", top: haut, left: `${gauche}%`, transform: "translateX(-50%)",
    fontSize: 11, color: "text.secondary", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{texte}</Box>;
  return <Stack spacing={1}>
    <Typography variant="caption" color="text.secondary" fontWeight={600}>Position {de(nom)} dans la grille de commissionnement{vue === "tous" ? " (apporteur par défaut)" : ""}</Typography>
    <Box role="img" aria-label={`Portefeuille en place ${euros(j.place)} HT par mois, palier ${j.palier}`} sx={{ position: "relative", height: 62, mx: 2 }}>
      {etiquette(Math.max(4, x1 / 2), 0, pourcentage(p.taux1Pdm))}
      {etiquette((x1 + x2) / 2, 0, pourcentage(p.taux2Pdm))}
      {etiquette((x2 + 100) / 2, 0, pourcentage(p.taux3Pdm))}
      <Box sx={{ position: "absolute", top: 18, left: 0, right: 0, height: 14, borderRadius: "7px", overflow: "hidden" }}>
        {bande(0, x1, TEINTES.gris, 0.3)}{bande(x1, x2 - x1, TEINTES.bleu, 0.22)}{bande(x2, 100 - x2, TEINTES.menthe, 0.28)}
        {bande(0, x(j.pipe), TEINTES.orange, 0.55)}{bande(0, x(j.place), TEINTES.menthe)}
      </Box>
      <Box sx={{ position: "absolute", top: 10, height: 30, width: 3, borderRadius: 2, bgcolor: JETONS.encre, left: `calc(${x(j.place)}% - 1.5px)` }} />
      {etiquette(x1, 44, euros(p.seuil1Centimes))}
      {etiquette(x2, 44, euros(p.seuil2Centimes))}
    </Box>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ fontSize: 13, color: "text.secondary" }}>
      <span><Carre couleur={TEINTES.menthe} />En place</span>
      <span><Carre couleur={TEINTES.orange} opacite={0.6} />Bons de commande envoyés et commandes validées</span>
    </Stack>
    {j.palier < 3
      ? <Alert severity="warning" icon={false}>Portefeuille en place : il manque <b>{euros(j.manque)}</b> HT par mois pour passer à <b>{pourcentage(j.prochainTauxPdm)}</b>, soit environ <b>{j.salles} salle{j.salles > 1 ? "s" : ""}</b> en Talk et Konnect. Avec les bons de commande envoyés et les commandes validées, le portefeuille atteindrait {euros(j.pipe)} HT par mois (taux {pourcentage(j.tauxPipePdm)}).</Alert>
      : <Alert severity="success" icon={false}>Palier maximal atteint : <b>{pourcentage(p.taux3Pdm)}</b> sur tout le portefeuille, avec une marge de <b>{euros(j.marge)}</b> HT par mois au-dessus du seuil.</Alert>}
  </Stack>;
}

export function Carre({ couleur, opacite = 1 }: { couleur: string; opacite?: number }) {
  return <Box component="span" aria-hidden sx={{ display: "inline-block", width: 14, height: 10, borderRadius: "2px", bgcolor: couleur, opacity: opacite, mr: 0.75 }} />;
}

/** Sur téléphone, sept colonnes ne tiennent qu'avec des en-têtes abrégés ; le libellé entier reste lisible au survol et à l'oreille. */
const ABREGES: Record<StatutCommande, string> = { prospect: "Pros.", envoyee: "BC", validee: "Val.", installee: "Inst." };
function EnTeteCourt({ long, court }: { long: string; court: string }) {
  return <Box component="span" title={long}>
    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{long}</Box>
    <Box component="span" aria-hidden sx={{ display: { xs: "inline", sm: "none" } }}>{court}</Box>
    <Box component="span" sx={{ display: { xs: "inline", sm: "none" }, position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>{long}</Box>
  </Box>;
}

export function TableauModalites({ groupes }: { groupes: GroupeDonnees[] }) {
  const s = syntheseModalites(groupes);
  const cellules = (o: Record<string, number>) => <>{s.cles.map((k) => <TableCell key={k} align="right">{o[k] || ""}</TableCell>)}<TableCell align="right">{s.total(o as never) || ""}</TableCell></>;
  return <Table size="small" sx={{ ...TABLEAU, "& td, & th": { ...TABLEAU["& td, & th"], fontVariantNumeric: "tabular-nums" } }}>
    <TableHead><TableRow>
      <TableCell sx={{ width: { xs: "24%", md: "28%" } }}>Synthèse</TableCell>
      {ETAPES_COMMANDE.map((e) => <TableCell key={e.cle} align="right"><EnTeteCourt long={e.court} court={ABREGES[e.cle]} /></TableCell>)}
      <TableCell align="right"><EnTeteCourt long="Hors offre" court="Hors" /></TableCell><TableCell align="right">Total</TableCell>
    </TableRow></TableHead>
    <TableBody>
      <TableRow><TableCell sx={{ fontWeight: 600 }}>Groupes</TableCell>{cellules(s.groupes)}</TableRow>
      <TableRow><TableCell sx={{ fontWeight: 600 }}>Sites / salles</TableCell>
        {s.cles.map((k) => <TableCell key={k} align="right">{s.sites[k] || s.salles[k] ? `${s.sites[k]} / ${s.salles[k]}` : ""}</TableCell>)}
        <TableCell align="right">{s.total(s.sites)} / {s.total(s.salles)}</TableCell></TableRow>
      <TableRow><TableCell colSpan={7} sx={{ bgcolor: JETONS.gris, fontWeight: 600, fontSize: 12 }}>Salles par modalité</TableCell></TableRow>
      {MODALITES.filter((m) => s.modalites.has(m.code)).map((m) => <TableRow key={m.code}><TableCell sx={{ pl: 3 }}>{libelleModalite(m.code)}</TableCell>{cellules(s.modalites.get(m.code)!)}</TableRow>)}
      {!s.modalites.size && <TableRow><TableCell colSpan={7} sx={{ color: "text.secondary" }}>Aucune salle</TableCell></TableRow>}
    </TableBody>
  </Table>;
}

function CreationGroupe({ donnees: d, moteur, vue, fermer, ouvrir }: { donnees: DonneesApports; moteur: Moteur; vue: Vue; fermer: () => void; ouvrir: (id: number) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"nouveau" | "existant">("nouveau");
  const defaut = vue !== "tous" ? vue : moteur.defaut;
  return <DialogueFormulaire titre="Ajouter un groupe" bouton="Ajouter" fermer={fermer} soumettre={async (f) => {
    const apporteurId = Number(f.get("apporteurId"));
    const corps = mode === "nouveau" ? { nom: String(f.get("nom") ?? "").trim(), apporteurId } : { organisationId: Number(f.get("organisationId")), apporteurId };
    if (mode === "nouveau" && !corps.nom) throw new Error("Donnez le nom d'usage du groupe.");
    if (mode === "existant" && !("organisationId" in corps && corps.organisationId)) throw new Error("Choisissez le client.");
    const r = await envoyer<{ organisationId: number }>("/api/pilot/apports", "POST", undefined, corps);
    router.refresh();
    ouvrir(r.organisationId);
  }}>
    <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
      <FormControlLabel value="nouveau" control={<Radio />} label="Nouveau prospect" />
      <FormControlLabel value="existant" control={<Radio />} label="Client déjà dans Pilot" disabled={!d.clientsSansApport.length} />
    </RadioGroup>
    {mode === "nouveau"
      ? <TextField name="nom" label="Nom d'usage du groupe" required autoFocus inputProps={{ maxLength: 200 }} helperText="Un nouveau client est créé au stade Prospect, avec un premier site." />
      : <TextField name="organisationId" select label="Client" required defaultValue="">
        {d.clientsSansApport.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
      </TextField>}
    <TextField name="apporteurId" select label="Apporteur d'affaires" required defaultValue={defaut || ""}>
      {d.apporteurs.map((a) => <MenuItem key={a.id} value={a.id}>{a.nom}{a.structure ? ` (${a.structure})` : ""}</MenuItem>)}
    </TextField>
  </DialogueFormulaire>;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Box, Button, Card, Chip, InputAdornment, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { IconSearch } from "@tabler/icons-react";
import type { CrmPriorite } from "@prisma/client";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { PastilleTemperature } from "@/pilot/components/PastilleTemperature";
import { LIBELLES_TEMPERATURE } from "@/pilot/lib/organisations/temperature";
import { NIVEAUX_TEMPERATURE } from "@/pilot/lib/organisations/temperatureAffichage";
import { ORIGINES, TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { dateCourte } from "@/pilot/lib/integration/estimation";
import { debutDuJour } from "@/pilot/lib/dates";
import { compter } from "@/pilot/lib/texte";
import { INCONNU, LIBELLES_ETAT, ORDRE_PRIORITES, PRIORITES, REGIONS, ilYA, type CleRegion } from "@/pilot/lib/prospection/regles";
import type { FiltresProspection, LigneProspection } from "@/pilot/lib/prospection/charger";
import { JETONS } from "@/pilot/jetons";

type Donnees = { lignes: LigneProspection[]; total: number; jamais: number; aRelancer: number; page: number; pages: number;
  options: { ris: string[]; rdv: string[] } };
type Filtres = Omit<FiltresProspection, "q" | "page">;
const CLES: (keyof Filtres)[] = ["region", "priorite", "temperature", "tri", "etat", "ris", "rdv", "type", "responsable", "origine"];

// Les colonnes secondaires cèdent la place plutôt que de créer une barre horizontale.
const LARGE = { display: { xs: "none", lg: "table-cell" } };
const MOYEN = { display: { xs: "none", md: "table-cell" } };
const PETIT = { display: { xs: "none", sm: "table-cell" } };

/**
 * La vue « À prospecter » (C-65). Les filtres vivent dans l'adresse de la page,
 * pour qu'un lien les partage ; le texte cherché, lui, reste dans la page et part
 * en POST (C-36).
 */
export function VueProspection({ initiale, filtresInitiaux, comptes, moiId }: {
  initiale: Donnees; filtresInitiaux: Filtres; comptes: { id: number; name: string | null }[]; moiId: number;
}) {
  const [donnees, setDonnees] = useState(initiale);
  const [filtres, setFiltres] = useState<Filtres>(() => Object.fromEntries(CLES.filter((c) => filtresInitiaux[c]).map((c) => [c, filtresInitiaux[c]])));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichir, setRafraichir] = useState(0);
  const premier = useRef(true);
  const demande = useRef(0);
  const derniereInitiale = useRef(initiale);

  // Un prospect créé depuis le panneau recharge la page serveur : la liste se recharge avec les filtres en cours.
  useEffect(() => {
    if (derniereInitiale.current === initiale) return;
    derniereInitiale.current = initiale;
    setRafraichir((r) => r + 1);
  }, [initiale]);

  // Les filtres, le texte et la page déclenchent une seule requête ; le texte attend la fin de la frappe.
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    const numero = ++demande.current;
    const minuterie = setTimeout(async () => {
      setChargement(true);
      try {
        const r = await envoyer<Donnees>("/api/pilot/prospects/liste", "POST", undefined, { ...filtres, q: q.trim() || undefined, page: String(page) });
        if (numero === demande.current) { setDonnees(r); setErreur(null); }
      } catch (e) {
        if (numero === demande.current) setErreur(e instanceof Error ? e.message : "La liste est indisponible.");
      } finally { if (numero === demande.current) setChargement(false); }
    }, q ? 300 : 0);
    return () => clearTimeout(minuterie);
  }, [filtres, q, page, rafraichir]);

  function filtrer(cle: keyof Filtres, valeur: string) {
    const suivants = { ...filtres, [cle]: valeur || undefined };
    if (!valeur) delete suivants[cle];
    setFiltres(suivants); setPage(1);
    const adresse = new URLSearchParams(Object.entries(suivants).filter(([, v]) => v) as [string, string][]).toString();
    window.history.replaceState(null, "", `/pilot/pipeline/prospection${adresse ? `?${adresse}` : ""}`);
  }
  const actifs = CLES.filter((c) => filtres[c]).length + (q ? 1 : 0);
  const debut = (donnees.page - 1) * 50;

  return <Stack spacing={1.5}>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
      <TextField type="search" placeholder="Nom, ville, code postal, groupe" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
        inputProps={{ "aria-label": "Chercher un prospect", maxLength: 200 }} sx={{ flex: "1 1 260px", maxWidth: 420 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><IconSearch size={18} /></InputAdornment> }} />
      <Choix libelle="Région" tous="toutes" valeur={filtres.region} changer={(v) => filtrer("region", v)}>
        {(Object.keys(REGIONS) as CleRegion[]).map((r) => <option key={r} value={r}>{REGIONS[r].nom}</option>)}
      </Choix>
      <Choix libelle="Priorité" tous="toutes" valeur={filtres.priorite} changer={(v) => filtrer("priorite", v)}>
        {ORDRE_PRIORITES.map((p) => <option key={p} value={p}>{PRIORITES[p]}</option>)}
        <option value={INCONNU}>Sans priorité</option>
      </Choix>
      <Choix libelle="Température" tous="toutes" valeur={filtres.temperature} changer={(v) => filtrer("temperature", v)}>
        {NIVEAUX_TEMPERATURE.map((n) => <option key={n} value={n}>{LIBELLES_TEMPERATURE[n]}</option>)}
      </Choix>
      <Choix libelle="RIS" tous="tous" valeur={filtres.ris} changer={(v) => filtrer("ris", v)}>
        {donnees.options.ris.map((r) => <option key={r} value={r}>{r}</option>)}
        <option value={INCONNU}>Non renseigné</option>
      </Choix>
      <Choix libelle="Prise de RDV" tous="toutes" valeur={filtres.rdv} changer={(v) => filtrer("rdv", v)}>
        {donnees.options.rdv.map((r) => <option key={r} value={r}>{r}</option>)}
        <option value={INCONNU}>Non renseignée</option>
      </Choix>
      <Choix libelle="Type" tous="tous" valeur={filtres.type} changer={(v) => filtrer("type", v)}>
        {Object.entries(TYPES_ORGANISATION).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
      </Choix>
      <Choix libelle="Commercial" tous="tous" valeur={filtres.responsable} changer={(v) => filtrer("responsable", v)}>
        <option value="moi">À moi</option>
        {comptes.filter((c) => c.id !== moiId).map((c) => <option key={c.id} value={c.id}>{c.name ?? "Compte interne"}</option>)}
        <option value={INCONNU}>Non attribué</option>
      </Choix>
      <Choix libelle="Origine" tous="toutes" valeur={filtres.origine} changer={(v) => filtrer("origine", v)}>
        {Object.entries(ORIGINES).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
        <option value={INCONNU}>Non renseignée</option>
      </Choix>
      <Choix libelle="Trier par" tous="priorité" valeur={filtres.tri} changer={(v) => filtrer("tri", v)}>
        <option value="temperature">Température, les plus chauds d&apos;abord</option>
      </Choix>
    </Stack>

    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
      {(["JAMAIS", "A_RELANCER"] as const).map((etat) => <Chip key={etat} clickable
        label={`${LIBELLES_ETAT[etat]} · ${etat === "JAMAIS" ? donnees.jamais : donnees.aRelancer}`}
        color={filtres.etat === etat ? "primary" : "default"} variant={filtres.etat === etat ? "filled" : "outlined"}
        aria-pressed={filtres.etat === etat} onClick={() => filtrer("etat", filtres.etat === etat ? "" : etat)} />)}
      <Typography variant="body2" color="text.secondary" role="status" sx={{ ml: { sm: 1 } }}>
        {chargement ? "Recherche…" : compter(donnees.total, "prospect")}
      </Typography>
      {actifs > 0 && <Button size="small" onClick={() => { setQ(""); setFiltres({}); setPage(1); window.history.replaceState(null, "", "/pilot/pipeline/prospection"); }}>
        Effacer les filtres
      </Button>}
    </Stack>

    {erreur && <Typography color="error" role="alert">{erreur}</Typography>}

    <Card sx={{ opacity: chargement ? 0.6 : 1, transition: "opacity 120ms" }}>
      <Table size="small" aria-label="Prospects à contacter">
        <TableHead>
          <TableRow>
            <TableCell>Établissement</TableCell>
            <TableCell>Priorité</TableCell>
            <TableCell sx={LARGE}>Température</TableCell>
            <TableCell sx={LARGE}>RIS</TableCell>
            <TableCell sx={LARGE}>Prise de RDV</TableCell>
            <TableCell sx={PETIT}>Dernier contact</TableCell>
            <TableCell sx={MOYEN}>Prochaine action</TableCell>
            <TableCell sx={PETIT} align="right"><Box component="span" sx={visuellementCache}>Actions</Box></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {!donnees.lignes.length && <TableRow><TableCell colSpan={8}>
            <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Aucun prospect ne correspond. Effacez un filtre, ou créez le prospect avec « Nouveau prospect ».
            </Typography>
          </TableCell></TableRow>}
          {donnees.lignes.map((l) => <Ligne key={l.id} ligne={l} />)}
        </TableBody>
      </Table>
    </Card>

    {donnees.pages > 1 && <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
      <Typography variant="body2" color="text.secondary">{debut + 1} à {Math.min(debut + 50, donnees.total)} sur {donnees.total}</Typography>
      <Button size="small" variant="outlined" disabled={donnees.page <= 1 || chargement} onClick={() => setPage(donnees.page - 1)}>Précédents</Button>
      <Button size="small" variant="outlined" disabled={donnees.page >= donnees.pages || chargement} onClick={() => setPage(donnees.page + 1)}>Suivants</Button>
    </Stack>}
  </Stack>;
}

// En pixels : pour MUI, `width: 1` voudrait dire 100 % et ferait déborder la page.
const visuellementCache = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

function Ligne({ ligne: l }: { ligne: LigneProspection }) {
  const maintenant = new Date();
  const enRetard = !!l.prochaineActionLe && new Date(l.prochaineActionLe) < debutDuJour(maintenant);
  const lieu = [l.ville, l.codePostal].filter(Boolean).join(" · ");
  return <TableRow hover>
    <TableCell sx={{ minWidth: 180 }}>
      <Typography component={Link} href={`/pilot/organisations/${l.id}`} fontWeight={600} sx={{ display: "block", lineHeight: 1.3, overflowWrap: "break-word" }}>{l.nom}</Typography>
      <Typography variant="caption" color="text.secondary">
        {[TYPES_ORGANISATION[l.type], lieu || "Ville non renseignée", l.sites !== null && l.sites > 1 ? compter(l.sites, "site") : null, l.responsable].filter(Boolean).join(" · ")}
      </Typography>
      {/* Sous 1200 px la colonne Température disparaît : la pastille passe sous le nom. */}
      {l.temperature && <Box sx={{ display: { xs: "block", lg: "none" }, mt: 0.5 }}><PastilleTemperature valeur={l.temperature} /></Box>}
    </TableCell>
    <TableCell><Priorite valeur={l.priorite} /></TableCell>
    <TableCell sx={LARGE}>{l.temperature ? <PastilleTemperature valeur={l.temperature} /> : <Box component="span" sx={{ color: "text.secondary" }}>Sans objet</Box>}</TableCell>
    <TableCell sx={{ ...LARGE, maxWidth: 180 }}>
      <Valeur texte={l.ris} />{l.ris && l.risVersion && <Precision>version {l.risVersion}</Precision>}
    </TableCell>
    <TableCell sx={{ ...LARGE, maxWidth: 180 }}><Valeur texte={l.outilRdv} /></TableCell>
    <TableCell sx={{ ...PETIT, whiteSpace: "nowrap" }}>
      {l.dernierEchangeLe ? ilYA(new Date(l.dernierEchangeLe), maintenant) : <Box component="span" sx={{ color: "text.secondary" }}>Jamais</Box>}
    </TableCell>
    <TableCell sx={{ ...MOYEN, maxWidth: 240 }}>
      {l.prochaineAction || l.prochaineActionLe
        ? <Box sx={{ color: enRetard ? "error.main" : "text.primary" }}>
          {l.prochaineAction ?? "Action"}
          {l.prochaineActionLe && <Precision couleur={enRetard ? "error.main" : undefined}>{enRetard ? "en retard · " : ""}{dateCourte(l.prochaineActionLe)}</Precision>}
        </Box>
        : <Box component="span" sx={{ color: "text.secondary" }}>Aucune</Box>}
    </TableCell>
    <TableCell sx={PETIT} align="right">
      <Button size="small" component={Link} href={`/pilot/organisations/${l.id}?onglet=chronologie&saisir=1`} aria-label={`Noter un échange avec ${l.nom}`}>Noter</Button>
    </TableCell>
  </TableRow>;
}

function Priorite({ valeur }: { valeur: CrmPriorite | null }) {
  if (!valeur) return <Box component="span" sx={{ color: "text.secondary" }}>Aucune</Box>;
  const haute = valeur === "A_PLUS" || valeur === "A";
  return <Chip size="small" label={PRIORITES[valeur]} color={haute ? "primary" : "default"} variant={valeur === "A_PLUS" ? "filled" : "outlined"}
    sx={{ minWidth: 40, fontWeight: 600, ...(haute ? {} : { bgcolor: JETONS.gris, borderColor: "transparent" }) }} />;
}

function Precision({ children, couleur }: { children: ReactNode; couleur?: string }) {
  return <Box component="span" sx={{ display: "block", color: couleur ?? "text.secondary", fontSize: 12 }}>{children}</Box>;
}

/** « Doctolib (hôpital, imagerie à confirmer) » : l'outil d'abord, la réserve dessous. */
function Valeur({ texte }: { texte: string | null }) {
  if (!texte) return <Box component="span" sx={{ color: "text.secondary" }}>Inconnu</Box>;
  const reserve = texte.match(/^(.*\S)\s+\(([^()]*à confirmer[^()]*)\)$/);
  return reserve ? <>{reserve[1]}<Precision>{reserve[2]}</Precision></> : <>{texte}</>;
}

/** Une liste déroulante native, compacte : « Région : toutes ». Le lecteur d'écran garde le nom du filtre. */
function Choix({ libelle, tous, valeur, changer, children }: { libelle: string; tous: string; valeur?: string; changer: (v: string) => void; children: ReactNode }) {
  return <TextField select hiddenLabel SelectProps={{ native: true }} value={valeur ?? ""} onChange={(e) => changer(e.target.value)}
    inputProps={{ "aria-label": libelle }} sx={valeur ? { "& .MuiInputBase-root": { bgcolor: JETONS.accentFond } } : undefined}>
    <option value="">{libelle} : {tous}</option>{children}
  </TextField>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import type { RapportImportProspects } from "@/pilot/lib/import/prospects";

/**
 * Importer des prospects depuis un fichier Excel ou CSV (retour de Maxime, 25/11/2026).
 * Deux temps : « Vérifier » lit le fichier et montre ce qui sera créé, sans rien écrire ;
 * « Importer » écrit. Les colonnes sont reconnues par leur nom, le modèle les donne.
 */
export function ImportProspects() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [rapport, setRapport] = useState<RapportImportProspects | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  function fermer() { setOuvert(false); setFichier(null); setRapport(null); setErreur(null); }
  async function lancer(essai: boolean) {
    if (!fichier) return;
    setEnvoi(true); setErreur(null);
    try {
      const donnees = new FormData();
      donnees.set("fichier", fichier);
      donnees.set("essai", essai ? "1" : "0");
      const reponse = await fetch("/api/pilot/prospects/import", { method: "POST", body: donnees }).catch(() => null);
      if (!reponse) throw new Error("Le serveur est injoignable. Réessayez.");
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(corps.erreur ?? "L'import a échoué. Réessayez dans un instant.");
      setRapport(corps.rapport);
      if (!essai) router.refresh();
    } catch (e) { setErreur(e instanceof Error ? e.message : "L'import a échoué."); setRapport(null); }
    finally { setEnvoi(false); }
  }

  const fait = rapport && !rapport.essai;
  return <>
    <Button variant="outlined" startIcon={<IconUpload size={18} />} onClick={() => setOuvert(true)}>Importer</Button>
    <Dialog open={ouvert} onClose={fermer} fullWidth maxWidth="md" aria-labelledby="titre-import-prospects">
      <DialogTitle id="titre-import-prospects">Importer des prospects</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Un fichier Excel (.xlsx) ou CSV, une ligne par centre. Les colonnes sont reconnues par leur nom : nom du centre, type de marché,
            adresse, site web, contact, fonction, téléphone, e-mail, date du dernier contact, nature du contact, statut, commentaires, RIS,
            agenda maître, prestataire téléphonique. Seul le nom du centre est obligatoire.
          </Typography>
          <Box><Button component="a" href="/api/pilot/prospects/import/modele.xlsx" startIcon={<IconDownload size={18} />}>Télécharger le modèle</Button></Box>
          {!fait && <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Button variant="outlined" component="label">
              Choisir le fichier
              <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFichier(e.target.files?.[0] ?? null); setRapport(null); setErreur(null); e.target.value = ""; }} />
            </Button>
            <Typography variant="body2" color={fichier ? "text.primary" : "text.secondary"} sx={{ overflowWrap: "anywhere" }}>{fichier ? fichier.name : "Aucun fichier choisi"}</Typography>
          </Stack>}
          {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
          {rapport && <Rapport rapport={rapport} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={fermer}>{fait ? "Fermer" : "Annuler"}</Button>
        {!fait && <Button variant="outlined" disabled={!fichier || envoi} onClick={() => lancer(true)}>Vérifier</Button>}
        {!fait && <Button variant="contained" disabled={!rapport?.essai || !rapport.aCreer.length || envoi} onClick={() => lancer(false)}>
          {rapport?.essai && rapport.aCreer.length ? `Importer ${rapport.aCreer.length} prospect${rapport.aCreer.length > 1 ? "s" : ""}` : "Importer"}
        </Button>}
      </DialogActions>
    </Dialog>
  </>;
}

function Rapport({ rapport: r }: { rapport: RapportImportProspects }) {
  const nombre = r.essai ? r.aCreer.length : r.creees;
  return <Stack spacing={1.5}>
    <Alert severity={r.essai ? "info" : "success"} icon={false}>
      {r.essai
        ? `Vérification : ${r.lues} ligne${r.lues > 1 ? "s" : ""} lue${r.lues > 1 ? "s" : ""}, ${nombre} prospect${nombre > 1 ? "s" : ""} à créer. Rien n'est encore enregistré.`
        : `${nombre} prospect${nombre > 1 ? "s" : ""} créé${nombre > 1 ? "s" : ""}. Vous en êtes le commercial ; changez-le sur la fiche si besoin.`}
    </Alert>
    {!!r.colonnesReconnues.length && <Typography variant="body2" color="text.secondary">Colonnes lues : {r.colonnesReconnues.join(" · ")}</Typography>}
    {!!r.colonnesIgnorees.length && <Typography variant="body2" color="warning.main">Colonnes ignorées (nom non reconnu) : {r.colonnesIgnorees.join(", ")}</Typography>}
    {!!r.dejaLa.length && <Liste titre={`Déjà dans Pilot, laissés tels quels (${r.dejaLa.length})`}>
      {r.dejaLa.map((d) => <li key={d.ligne}>Ligne {d.ligne} : <Link href={`/pilot/organisations/${d.id}`}>{d.nom}</Link></li>)}
    </Liste>}
    {!!r.refusees.length && <Liste titre={`Lignes refusées (${r.refusees.length})`}>{r.refusees.map((d) => <li key={d.ligne}>Ligne {d.ligne} : {d.raison}</li>)}</Liste>}
    {!!r.avertissements.length && <Liste titre={`À vérifier après l'import (${r.avertissements.length})`}>{r.avertissements.map((d, i) => <li key={i}>Ligne {d.ligne} : {d.message}</li>)}</Liste>}
    {r.essai && !!r.aCreer.length && <Liste titre={`À créer (${r.aCreer.length})`} ouvert={r.aCreer.length <= 15}>
      {r.aCreer.map((d) => <li key={d.ligne}>Ligne {d.ligne} : {d.nom} · {d.type} · {d.etape}</li>)}
    </Liste>}
  </Stack>;
}

function Liste({ titre, children, ouvert = true }: { titre: string; children: React.ReactNode; ouvert?: boolean }) {
  return <Box component="details" open={ouvert}>
    <Box component="summary" sx={{ cursor: "pointer", fontWeight: 600 }}>{titre}</Box>
    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 3, maxHeight: 220, overflowY: "auto", "& li": { mb: 0.25 } }}>{children}</Box>
  </Box>;
}

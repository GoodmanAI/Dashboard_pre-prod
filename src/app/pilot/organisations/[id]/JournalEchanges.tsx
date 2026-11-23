"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Chip, MenuItem, Snackbar, Stack, TextField, Typography } from "@mui/material";
import type { CrmTypeEchange } from "@prisma/client";
import type { PageChronologie } from "@/pilot/lib/evenements/lire";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import { modificationEchange, saisieEchange } from "@/pilot/lib/validation/echange";
import { debutDuJour } from "@/pilot/lib/dates";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ActionsSuivi } from "@/pilot/components/formulaires/ActionsSuivi";

// Fuseau explicite : sinon le serveur et le navigateur peuvent afficher deux heures différentes.
const DATE_HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

export function JournalEchanges({ organisationId, contacts, chronologieInitiale, moi }: {
  organisationId: number; contacts: { id: number; nom: string }[]; chronologieInitiale: PageChronologie;
  /** Pour proposer « Corriger » à l'auteur de l'échange et au super-administrateur (C-86). */
  moi?: { id: number; role: string };
}) {
  const router = useRouter();
  const recherche = useSearchParams()!;
  const [historique, setHistorique] = useState(chronologieInitiale);
  const [chargement, setChargement] = useState(false);
  const [ouvert, setOuvert] = useState(recherche.get("saisir") === "1");
  const [message, setMessage] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ id: number; texte: string; jalon: boolean } | null>(null);
  useEffect(() => { if (recherche.get("saisir") === "1") setOuvert(true); }, [recherche]);
  useEffect(() => setHistorique((precedent) => {
    if (precedent.elements.length <= chronologieInitiale.elements.length) return chronologieInitiale;
    const vus = new Set(chronologieInitiale.elements.map((e) => `${e.nature}-${e.id}`));
    const dernier = chronologieInitiale.elements.at(-1);
    const plusAnciens = precedent.elements.filter((e) =>
      !vus.has(`${e.nature}-${e.id}`) && (!dernier || e.surveneuLe <= dernier.surveneuLe));
    return { elements: [...chronologieInitiale.elements, ...plusAnciens], suite: precedent.suite, curseur: precedent.curseur };
  }), [chronologieInitiale]);
  function fermer() {
    setOuvert(false);
    if (recherche.has("saisir")) {
      const params = new URLSearchParams(recherche.toString()); params.delete("saisir");
      router.replace(`/pilot/organisations/${organisationId}?${params}`, { scroll: false });
    }
  }
  async function chargerAnciens() {
    if (chargement || !historique.curseur) return;
    setChargement(true);
    try {
      const params = new URLSearchParams({ organisationId: String(organisationId), avant: historique.curseur });
      const r = await fetch(`/api/pilot/evenements?${params}`);
      if (!r.ok) throw new Error();
      const page: PageChronologie = await r.json();
      setHistorique((precedent) => ({ ...page, elements: [...precedent.elements, ...page.elements] }));
    } catch { setMessage("Les événements plus anciens n'ont pas pu être chargés."); }
    finally { setChargement(false); }
  }
  return <>
    <Button onClick={() => setOuvert(true)} variant="outlined" sx={{ mb: 2 }}>Noter un échange</Button>
    {ouvert && <DialogueSaisie organisationId={organisationId} contacts={contacts} fermer={fermer} termine={() => { fermer(); router.refresh(); }} />}
    {!historique.elements.length ? <Typography variant="body2" color="text.secondary">
      Aucun échange ni événement pour l&apos;instant. Notez le premier échange.
    </Typography> : <Stack spacing={2}>
      {historique.elements.map((e) => e.nature === "evenement" ? <Box key={`evenement-${e.id}`}>
        <Typography variant="body2" color={e.type === "ETAPE_COMMERCIALE_CHANGEE" ? "primary.main" : "text.secondary"}>{e.resume}</Typography>
        <Typography variant="caption" color="text.secondary">{DATE_HEURE.format(new Date(e.surveneuLe))}{e.auteurId === null ? " · par le système" : ` · par ${e.auteur ?? "un membre de l'équipe"}`}</Typography>
      </Box> : <Box key={`echange-${e.id}`} sx={{ borderLeft: 2, borderColor: "divider", pl: 2, py: 0.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" fontWeight={600}>{LIBELLES_ECHANGE[e.type]}</Typography>
          {e.statut !== "REALISE" && <Chip size="small" variant="outlined" label={e.statut === "PLANIFIE" ? "Prévu" : "Annulé"} />}
          <Typography variant="caption" color="text.secondary">
            {DATE.format(new Date(e.surveneuLe))}{e.contact ? ` · ${e.contact}` : ""}{e.auteur ? ` · ${e.auteur}` : ""}
          </Typography>
        </Stack>
        {e.compteRendu && <Typography variant="body2" sx={{ mt: 0.5 }}>{e.compteRendu}</Typography>}
        {e.prochaineAction && <Typography variant="body2" sx={{ mt: 0.5, textDecoration: e.prochaineActionFaiteLe ? "line-through" : undefined }}
          color={!e.prochaineActionFaiteLe && e.prochaineActionLe && new Date(e.prochaineActionLe) < debutDuJour(new Date()) ? "error.main" : "text.secondary"}>
          Prochaine action : {e.prochaineAction}{e.prochaineActionLe ? ` · ${DATE.format(new Date(e.prochaineActionLe))}` : ""}
        </Typography>}
        {e.prochaineActionFaiteLe && <Typography variant="caption" color="text.secondary">Faite le {DATE.format(new Date(e.prochaineActionFaiteLe))}</Typography>}
        {e.statut === "PLANIFIE" && <ActionsSuivi organisationId={organisationId} echangeId={e.id} le={e.surveneuLe} />}
        {e.statut !== "PLANIFIE" && moi && (moi.role === "SUPER_ADMIN" || e.auteurId === moi.id) && <Button size="small" sx={{ ml: -1 }}
          onClick={() => setCorrection({ id: e.id, texte: e.compteRendu ?? "", jalon: e.type === "JALON" })}>Corriger le texte</Button>}
      </Box>)}
    </Stack>}
    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
      {historique.suite && <Button onClick={() => void chargerAnciens()} disabled={chargement}>Afficher les plus anciens</Button>}
      <Button onClick={() => setOuvert(true)}>Noter un échange</Button>
    </Stack>
    {correction && <DialogueFormulaire titre={correction.jalon ? "Corriger le nom de l'étape clé" : "Corriger le compte rendu"} fermer={() => setCorrection(null)} soumettre={async (f) => {
      await envoyer(`/api/pilot/echanges/${correction.id}`, "PATCH", modificationEchange, { operation: "corriger", compteRendu: String(f.get("compteRendu") ?? "").trim() || null });
      setCorrection(null); router.refresh();
    }}>
      <TextField name="compteRendu" label={correction.jalon ? "Étape clé" : "Compte rendu"} multiline minRows={3} autoFocus defaultValue={correction.texte}
        required={correction.jalon} helperText="Jamais de donnée patient. Le journal garde la trace de la correction, pas le texte." />
    </DialogueFormulaire>}
    <Snackbar open={message !== null} autoHideDuration={6000} onClose={() => setMessage(null)}>
      <Alert icon={false} severity="error" onClose={() => setMessage(null)}>{message}</Alert>
    </Snackbar>
  </>;
}

/** Aussi ouvert depuis Ventes, déjà réglé sur « Formation » ou « Interfaçage » à venir (C-62). */
export function DialogueSaisie({ organisationId, contacts, fermer, termine, titre = "Noter un échange", initial }: {
  organisationId: number; contacts: { id: number; nom: string }[]; fermer: () => void; termine: () => void;
  titre?: string; initial?: { type: CrmTypeEchange; statut: "REALISE" | "PLANIFIE" };
}) {
  const [statut, setStatut] = useState<string>(initial?.statut ?? "REALISE");
  const [typeEchange, setTypeEchange] = useState<string>(initial?.type ?? "APPEL");
  const texte = (f: FormData, cle: string) => String(f.get(cle) ?? "").trim();
  return <DialogueFormulaire titre={titre} fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/echanges", "POST", saisieEchange, {
      organisationId, statut, type: typeEchange,
      ...(typeEchange === "JALON" ? { aLaChargeDe: texte(f, "aLaChargeDe") } : {}), surveneuLe: texte(f, "surveneuLe"),
      contactId: texte(f, "contactId") ? Number(f.get("contactId")) : null,
      compteRendu: texte(f, "compteRendu") || null,
      ...(statut === "REALISE" ? { prochaineAction: texte(f, "prochaineAction") || null, prochaineActionLe: texte(f, "prochaineActionLe") || null } : {}),
    });
    termine();
  }}>
    <TextField label="Échange" select autoFocus value={statut} onChange={(e) => setStatut(e.target.value)}>
      <MenuItem value="REALISE">Échange réalisé</MenuItem><MenuItem value="PLANIFIE">Rendez-vous à venir</MenuItem>
    </TextField>
    <TextField name="type" label="Type" select value={typeEchange} onChange={(e) => { setTypeEchange(e.target.value); if (e.target.value === "JALON") setStatut("PLANIFIE"); }} required>
      {Object.entries(LIBELLES_ECHANGE).map(([id, libelle]) => <MenuItem key={id} value={id}>{libelle}</MenuItem>)}
    </TextField>
    {typeEchange === "JALON" && <TextField name="aLaChargeDe" label="À la charge de" select defaultValue="CLIENT" required><MenuItem value="CLIENT">Client</MenuItem><MenuItem value="LYRAE">Lyrae</MenuItem></TextField>}
    <TextField name="surveneuLe" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}
      InputLabelProps={{ shrink: true }} inputProps={statut === "PLANIFIE" ? { min: new Date().toISOString().slice(0, 10) } : undefined} />
    <TextField name="contactId" label="Contact" select defaultValue="">
      <MenuItem value="">Aucun</MenuItem>{contacts.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
    </TextField>
    <TextField name="compteRendu" label={typeEchange === "JALON" ? "Nom de l'étape clé" : "Compte rendu"} required={typeEchange === "JALON"} multiline minRows={2} inputProps={{ maxLength: 5000 }} />
    {statut === "REALISE" && <>
      <TextField name="prochaineAction" label="Prochaine action" inputProps={{ maxLength: 500 }} />
      <TextField name="prochaineActionLe" label="Pour le" type="date" InputLabelProps={{ shrink: true }} />
    </>}
  </DialogueFormulaire>;
}

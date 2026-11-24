"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import type { Alerte } from "@/pilot/lib/alertes/types";
import { dansJours } from "@/pilot/lib/dates";
import { nouvelAcquittement } from "@/pilot/lib/validation/acquittement";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

export function ActionsAlerte({ alerte }: { alerte: Alerte }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [jusquAu, setJusquAu] = useState("");
  const jour = (n: number) => dansJours(new Date(), n).toISOString().slice(0, 10);
  return <>
    <Button onClick={() => { setJusquAu(jour(7)); setOuvert(true); }}>Reporter</Button>
    {ouvert && <DialogueFormulaire titre="Reporter l'alerte" bouton="Reporter" fermer={() => setOuvert(false)} soumettre={async (formulaire) => {
      await envoyer("/api/pilot/alertes/acquitter", "POST", nouvelAcquittement, {
        cleAlerte: alerte.cle, organisationId: alerte.organisationId, jusquAu, raison: formulaire.get("raison"),
      });
      setOuvert(false); router.refresh();
    }}>
      <Typography>{alerte.titre} · {alerte.organisationNom}</Typography>
      <TextField required type="date" label="Jusqu'au" name="jusquAu" value={jusquAu} onChange={(e) => setJusquAu(e.target.value)}
        InputLabelProps={{ shrink: true }} inputProps={{ min: jour(1), max: jour(90) }} />
      <Stack direction="row" spacing={1}>{[7, 14, 30].map((n) => <Button key={n} onClick={() => setJusquAu(jour(n))}>{n} j</Button>)}</Stack>
      <TextField autoFocus required name="raison" label="Raison" inputProps={{ maxLength: 500 }} helperText="Pourquoi cette alerte peut attendre." />
    </DialogueFormulaire>}
  </>;
}
export function ReactiverAlerte({ id }: { id: number }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function reactiver() {
    setEnvoi(true); setErreur(null);
    try { await envoyer(`/api/pilot/alertes/acquittements/${id}/lever`, "POST"); router.refresh(); }
    catch (e) { setErreur(e instanceof Error ? e.message : "La réactivation a échoué."); }
    finally { setEnvoi(false); }
  }
  return <Stack spacing={1}>{erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
    <Button disabled={envoi} onClick={() => void reactiver()}>Réactiver</Button></Stack>;
}
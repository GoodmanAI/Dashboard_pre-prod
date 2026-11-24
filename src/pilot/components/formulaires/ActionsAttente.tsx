"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

export function ActionsAttente({ id, levee = true, libelle = "Relancé", apres, taille = "medium" }: { id: number; levee?: boolean; libelle?: string; apres?: () => void; taille?: "small" | "medium" }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function agir(operation: "relancer" | "lever") {
    await envoyer(`/api/pilot/etapes/${id}/attente`, "PATCH", undefined, { operation });
    setConfirmation(false); router.refresh(); apres?.();
  }
  async function relancer() {
    setEnvoi(true); setErreur(null);
    try { await agir("relancer"); }
    catch (e) { setErreur(e instanceof Error ? e.message : "La relance a échoué."); }
    finally { setEnvoi(false); }
  }
  return <Stack spacing={1}>
    {erreur && <Alert severity="error">{erreur}</Alert>}
    <Stack direction="row" spacing={0.5}>
      <Button size={taille} disabled={envoi} onClick={() => void relancer()}>{libelle}</Button>
      {levee && <Button size={taille} onClick={() => setConfirmation(true)}>Levée</Button>}
    </Stack>
    {confirmation && <DialogueFormulaire titre="Réponse reçue" fermer={() => setConfirmation(false)} soumettre={() => agir("lever")} bouton="Réponse reçue" suppression>
      <Typography>Le tiers a répondu. L&apos;attente sera levée. La case restera ouverte.</Typography>
    </DialogueFormulaire>}
  </Stack>;
}

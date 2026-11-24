"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { CrmEchange } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { saisieEchange, modificationEchange } from "@/pilot/lib/validation/echange";
import { debutDuJour } from "@/pilot/lib/dates";
import { compter } from "@/pilot/lib/texte";

export type JalonFiche = Pick<CrmEchange, "id" | "statut" | "compteRendu" | "aLaChargeDe"> & { surveneuLe: string };
export function PlanSignature({ organisationId, jalons, modifiable }: { organisationId: number; jalons: JalonFiche[]; modifiable: boolean }) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<{ operation: "ajouter" | "realiser" | "replanifier" | "annuler"; jalon?: JalonFiche } | null>(null);
  const jour = new Date().toISOString().slice(0, 10);
  const prevus = jalons.filter((j) => j.statut === "PLANIFIE");
  const franchis = jalons.filter((j) => j.statut === "REALISE").slice().reverse();
  const annules = jalons.filter((j) => j.statut === "ANNULE");
  const libelleDate = (j: JalonFiche) => new Date(j.surveneuLe).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  return <Card><CardContent>
    <Typography variant="h2" gutterBottom>Étapes jusqu&apos;à la signature</Typography>
    {!jalons.length && <Typography color="text.secondary">Aucun jalon. Notez avec le client les étapes jusqu&apos;à la signature.</Typography>}
    {!!jalons.length && !prevus.length && <Typography color="text.secondary">Aucun jalon à venir. Ajoutez la prochaine étape si la signature reste à préparer.</Typography>}
    <Stack spacing={2}>
      {prevus.map((j) => <Box key={j.id}>
        <Typography>{j.compteRendu ?? "Libellé à préciser"}</Typography>
        <Typography variant="body2" color={new Date(j.surveneuLe) < debutDuJour(new Date()) ? "warning.main" : "text.secondary"}>
          {libelleDate(j)} · {j.aLaChargeDe === "CLIENT" ? "Client" : j.aLaChargeDe === "LYRAE" ? "Lyrae" : "Responsable à préciser"}
          {new Date(j.surveneuLe) < debutDuJour(new Date()) ? " · En retard" : ""}
        </Typography>
        {modifiable && <Stack direction="row" spacing={1}>
          <Button onClick={() => setDialogue({ operation: "realiser", jalon: j })}>Franchi</Button>
          <Button onClick={() => setDialogue({ operation: "replanifier", jalon: j })}>Replanifier</Button>
          <Button onClick={() => setDialogue({ operation: "annuler", jalon: j })}>Annuler</Button>
        </Stack>}
      </Box>)}
      {!!franchis.length && <Box><Typography variant="h3" color="text.secondary">Étapes clés franchies</Typography>
        {franchis.map((j) => <Typography key={j.id} variant="body2" color="text.secondary">{j.compteRendu} · {libelleDate(j)}</Typography>)}
      </Box>}
      {!!annules.length && <Typography variant="body2" color="text.secondary">
        {compter(annules.length, "jalon annulé", "jalons annulés")}, visibles dans la chronologie.
      </Typography>}
    </Stack>
    {modifiable && <Button sx={{ mt: 2 }} onClick={() => setDialogue({ operation: "ajouter" })}>Ajouter une étape clé</Button>}
    {dialogue && <DialogueFormulaire
      titre={{ ajouter: "Ajouter une étape clé", realiser: "Franchir le jalon", replanifier: "Replanifier le jalon", annuler: "Annuler le jalon" }[dialogue.operation]}
      bouton={dialogue.operation === "realiser" ? "Confirmer" : dialogue.operation === "annuler" ? "Confirmer l'annulation" : "Enregistrer"}
      suppression={dialogue.operation === "annuler"}
      fermer={() => setDialogue(null)} soumettre={async (f) => {
        if (dialogue.operation === "ajouter") await envoyer("/api/pilot/echanges", "POST", saisieEchange, {
          organisationId, type: "JALON", statut: "PLANIFIE", compteRendu: f.get("compteRendu"), surveneuLe: f.get("surveneuLe"), aLaChargeDe: f.get("aLaChargeDe"),
        });
        else await envoyer("/api/pilot/echanges/" + dialogue.jalon!.id, "PATCH", modificationEchange, {
          operation: dialogue.operation, ...(dialogue.operation === "replanifier" ? { le: f.get("le") } : {}),
        });
        setDialogue(null); router.refresh();
      }}>
      {dialogue.operation === "ajouter" ? <>
        <TextField name="compteRendu" label="Nom de l'étape clé" required autoFocus inputProps={{ maxLength: 5000 }} />
        <TextField name="surveneuLe" label="Date" type="date" required defaultValue={jour} inputProps={{ min: jour }} InputLabelProps={{ shrink: true }} />
        <TextField name="aLaChargeDe" label="À la charge de" select required defaultValue="CLIENT">
          <MenuItem value="CLIENT">Client</MenuItem><MenuItem value="LYRAE">Lyrae</MenuItem>
        </TextField>
      </> : dialogue.operation === "replanifier" ? <TextField name="le" label="Nouvelle date" type="date" required autoFocus
        defaultValue={dialogue.jalon!.surveneuLe.slice(0, 10) < jour ? jour : dialogue.jalon!.surveneuLe.slice(0, 10)}
        inputProps={{ min: jour }} InputLabelProps={{ shrink: true }} /> :
        <Typography>{dialogue.operation === "realiser" ? "Le jalon sera marqué comme franchi." : "Le jalon restera dans l'historique avec la mention Annulé."}</Typography>}
    </DialogueFormulaire>}
  </CardContent></Card>;
}

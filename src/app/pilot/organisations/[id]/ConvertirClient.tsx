"use client";
import { useState } from "react";
import { Button, TextField, Tooltip, Typography } from "@mui/material";
import type { CrmEtapeCommerciale } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { cheminVersSigne } from "@/pilot/lib/pipeline";
import { propositionEnAttente } from "@/pilot/lib/propositions/regles";
import { conversionClient } from "@/pilot/lib/validation/conversion";
import type { PropositionFiche } from "./NegociationOrganisation";

/** La phrase qui rassure : convertir ne crée pas de nouvelle fiche. */
export const RIEN_NE_CHANGE = "La fiche, les contacts et la chronologie restent les mêmes.";

/**
 * « Convertir en client », dans l'en-tête de la fiche, à toutes les étapes avant
 * Signé. Une proposition qui attend une réponse (`propositionEnAttente`) : on
 * ouvre l'acceptation de cette version-là (C-39). Sinon : une boîte courte, qui crée un contrat en brouillon daté.
 */
export function ConvertirClient({ organisationId, etape, propositions, montantsModifiables, accepter, termine }: {
  organisationId: number; etape: CrmEtapeCommerciale; propositions: PropositionFiche[]; montantsModifiables: boolean;
  accepter: (propositionId: number) => void; termine: (message: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const libelle = etape === "EN_POC" ? "Valider le POC et convertir en client" : "Convertir en client";
  const chemin = cheminVersSigne(etape);
  if (!chemin) return null;
  if (!montantsModifiables) return <Tooltip title="Convertir en client crée un contrat : il faut le droit de modifier les montants.">
    <span><Button variant="outlined" disabled>{libelle}</Button></span>
  </Tooltip>;
  // La règle du serveur : seule la dernière version non brouillon peut attendre une réponse, jamais une version dépassée.
  const enCours = propositionEnAttente(propositions);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return <>
    <Button variant="outlined" onClick={() => enCours ? accepter(enCours.id) : setOuvert(true)}>{libelle}</Button>
    {ouvert && <DialogueFormulaire titre={libelle} bouton={libelle} fermer={() => setOuvert(false)} soumettre={async (f) => {
      await envoyer(`/api/pilot/organisations/${organisationId}/convertir`, "POST", conversionClient, {
        etapeLue: etape, signeLe: String(f.get("signeLe") ?? ""), debuteLe: String(f.get("debuteLe") ?? "") || null,
      });
      setOuvert(false);
      termine("Client converti. Son contrat est en brouillon, à compléter.");
    }}>
      <Typography>Le client passe en Signé.{chemin.length > 1 ? " Les étapes intermédiaires sont franchies aujourd'hui, une à une." : ""}</Typography>
      <Typography>Un contrat en brouillon est créé. Ajoutez ses lignes dans l&apos;onglet Argent.</Typography>
      <Typography variant="body2" color="text.secondary">{RIEN_NE_CHANGE}</Typography>
      <TextField name="signeLe" label="Date de signature" type="date" required autoFocus defaultValue={aujourdhui}
        inputProps={{ max: aujourdhui }} InputLabelProps={{ shrink: true }} helperText="Aujourd'hui au plus tard." />
      <TextField name="debuteLe" label="Début officiel, facultatif" type="date" InputLabelProps={{ shrink: true }} />
    </DialogueFormulaire>}
  </>;
}

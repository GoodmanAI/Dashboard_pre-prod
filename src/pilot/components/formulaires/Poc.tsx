"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Stack, TextField, Typography } from "@mui/material";
import type { CrmEtapeCommerciale, CrmIssueCyclePoc } from "@prisma/client";
import { finPrevuePoc, libellePocPrecedent } from "@/pilot/lib/organisations/poc";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

export function DialogueDebutPoc({ fermer, enregistrer }: { fermer: () => void; enregistrer: (date: string) => Promise<void> }) {
  return <DialogueFormulaire titre="Démarrer le POC" bouton="Passer en POC" fermer={fermer} soumettre={async (f) => enregistrer(String(f.get("pocDebuteLe")))}>
    <Typography>Le prospect teste Lyrae avant la signature. Un mois, prolongeable une seule fois d&apos;un mois.</Typography>
    <TextField name="pocDebuteLe" label="Début du POC" type="date" required autoFocus InputLabelProps={{ shrink: true }}
      helperText="Date obligatoire. La fin prévue se calcule, dernier jour compris." />
  </DialogueFormulaire>;
}

export function SuiviPoc({ org }: { org: { id: number; etape: CrmEtapeCommerciale; pocDebuteLe: string | null; pocProlongeLe: string | null;
  pocPrecedent: { debuteLe: string; prolongeLe: string | null; issue: CrmIssueCyclePoc } | null } }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  if (!org.pocDebuteLe) return null;
  const fin = finPrevuePoc({ pocDebuteLe: new Date(org.pocDebuteLe), pocProlongeLe: org.pocProlongeLe ? new Date(org.pocProlongeLe) : null });
  const date = (v: string | Date) => new Date(v).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  return <Stack spacing={0.75} sx={{ mt: 1, minWidth: 0 }}>
    <Typography variant="body2">POC avant signature : du {date(org.pocDebuteLe)} au {date(fin!)} inclus.
      {org.pocProlongeLe ? ` Prolongé d'un mois le ${date(org.pocProlongeLe)}.` : " Sans prolongation."}</Typography>
    <Typography variant="caption" color="text.secondary">L&apos;essai du contrat signé est distinct. Il se consulte dans Ventes et dans l&apos;onglet Argent.</Typography>
    {org.pocPrecedent && <Typography variant="body2" color="text.secondary">{libellePocPrecedent({
      debuteLe: new Date(org.pocPrecedent.debuteLe), prolongeLe: org.pocPrecedent.prolongeLe ? new Date(org.pocPrecedent.prolongeLe) : null, issue: org.pocPrecedent.issue,
    })}</Typography>}
    {org.etape === "EN_POC" && <>
      <Typography variant="body2">Décidez : valider le POC et convertir en client, prolonger, ou choisir « POC non transformé » dans Changer d&apos;étape.</Typography>
      {!org.pocProlongeLe && <Button variant="outlined" sx={{ alignSelf: "flex-start" }} onClick={() => setOuvert(true)}>Prolonger le POC d&apos;un mois</Button>}
    </>}
    {ouvert && <DialogueFormulaire titre="Prolonger le POC d'un mois" bouton="Prolonger d'un mois" fermer={() => setOuvert(false)} soumettre={async () => {
      await envoyer(`/api/pilot/organisations/${org.id}/poc`, "POST"); setOuvert(false); router.refresh();
    }}><Typography>Une seule prolongation est possible. La fin prévue sera repoussée d&apos;un mois.</Typography></DialogueFormulaire>}
  </Stack>;
}

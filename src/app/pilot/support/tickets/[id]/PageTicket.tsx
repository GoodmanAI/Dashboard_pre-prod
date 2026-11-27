"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, Stack, TextField, Typography } from "@mui/material";
import TicketClient from "@/pilot/ecrans/TicketClient";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { nouveauSujet } from "@/pilot/lib/validation/support";
import type { ContexteTicket } from "@/pilot/lib/support/depuisTicket";

/**
 * La demande du client, puis l'équipe : un sujet de support relié au ticket, où l'on
 * se dit qui fait quoi et comment le régler, et ce que le commercial doit dire au client.
 */
export function PageTicket({ contexte }: { contexte: ContexteTicket }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const ouvrirSujet = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (contexte.organisationId === null) return;
    const note = String(new FormData(e.currentTarget).get("noteInterne") ?? "");
    setErreur(null); setEnvoi(true);
    try {
      const { sujet } = await envoyer<{ sujet: { id: number } }>("/api/pilot/support", "POST", nouveauSujet,
        { organisationId: contexte.organisationId, titre: contexte.titre, ticketId: contexte.ticketId, noteInterne: note });
      router.push(`/pilot/support/${sujet.id}`);
    } catch (err) { setErreur(err instanceof Error ? err.message : "Le sujet n'a pas été ouvert. Réessayez."); }
    finally { setEnvoi(false); }
  };

  return <Stack spacing={2.5}>
    <TicketClient ticketId={contexte.ticketId} retourHref="/pilot/support?vue=clients" />
    <Card sx={{ p: 2.25 }} id="equipe">
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 600, mb: 0.75 }}>Dans l&apos;équipe</Typography>
      {contexte.sujetId !== null ? <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <Typography color="text.secondary" sx={{ flex: "1 1 260px" }}>L&apos;équipe en discute dans un sujet de support : notes, ce qu&apos;il faut dire au client, statut.</Typography>
        <Button variant="contained" component={Link} href={`/pilot/support/${contexte.sujetId}`}>Ouvrir le sujet de l&apos;équipe</Button>
      </Stack> : contexte.organisationId === null ? <Alert severity="info" icon={false}>
        Ce client n&apos;a pas encore de fiche dans Pilot. Reliez son compte dans « Comptes à relier », puis ouvrez le sujet de l&apos;équipe ici.
      </Alert> : <Box component="form" onSubmit={ouvrirSujet}>
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          Pour vous répartir le travail, ouvrez un sujet : l&apos;équipe et le commercial du client sont prévenus, par la cloche et par mail.
          Répondez au client ci-dessus ; ce qui s&apos;écrit ici reste entre vous.
        </Typography>
        <TextField name="noteInterne" label="Note pour l'équipe" placeholder="Qui s'en charge, ce qu'on a vu, comment le régler" multiline minRows={3} fullWidth required
          helperText="Ne nommez aucun patient." inputProps={{ maxLength: 5000 }} />
        {erreur && <Alert severity="error" sx={{ mt: 1.5 }}>{erreur}</Alert>}
        <Button type="submit" variant="contained" disabled={envoi} sx={{ mt: 1.5 }}>{envoi ? "Ouverture…" : "Ouvrir le sujet de l'équipe"}</Button>
      </Box>}
    </Card>
  </Stack>;
}

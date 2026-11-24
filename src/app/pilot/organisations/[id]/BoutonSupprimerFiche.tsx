"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";

/**
 * Pour une fiche créée par erreur ou en double (C-86), au super-administrateur seul.
 * Le serveur refuse dès qu'un contrat, une proposition envoyée ou l'apport y est passé, et dit pourquoi.
 */
export function BoutonSupprimerFiche({ organisationId, nom }: { organisationId: number; nom: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  return <>
    <Button color="error" onClick={() => setOuvert(true)}>Supprimer la fiche</Button>
    {ouvert && <DialogueFormulaire titre="Supprimer cette fiche ?" bouton="Supprimer" suppression fermer={() => setOuvert(false)} soumettre={async () => {
      await envoyer(`/api/pilot/organisations/${organisationId}`, "DELETE");
      router.push("/pilot/organisations"); router.refresh();
    }}>
      <Typography>{nom} disparaît de Pilot, avec ses contacts, ses échanges, ses commentaires et ses centres.</Typography>
      <Typography variant="body2" color="text.secondary">À faire seulement pour une fiche créée par erreur ou en double. Cela ne se défait pas.</Typography>
    </DialogueFormulaire>}
  </>;
}

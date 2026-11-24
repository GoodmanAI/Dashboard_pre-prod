"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Doublons, useDoublons } from "@/pilot/components/formulaires/Doublons";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ChampsOrganisation, valeursOrganisation, type CompteInterne } from "@/pilot/components/formulaires/ChampsOrganisation";
import { ChampsContact, valeursContact } from "@/pilot/components/formulaires/ChampsContact";
import type { SuggestionsSaisie } from "@/pilot/lib/organisations/suggestions";
import { creationOrganisation } from "@/pilot/lib/validation/organisation";

export function FormulaireOrganisation({ comptes, courantId, nomInitial, suggestions }: { comptes: CompteInterne[]; courantId: number; nomInitial: string; suggestions: SuggestionsSaisie }) {
  const router = useRouter();
  const annuler = () => router.push("/pilot/organisations");
  // Même alerte que « Nouveau prospect » : une fiche en double ne se supprime pas facilement (C-86).
  const [nom, setNom] = useState(nomInitial);
  const doublons = useDoublons(nom, "");
  const formulaire = useFormulaire(async (f) => {
    const contact = valeursContact(f, "contact.");
    const renseigne = Object.entries(contact).some(([cle, valeur]) => cle === "roleDecision" ? valeur !== "INCONNU" : typeof valeur === "string" && valeur.trim() !== "");
    const resultat = await envoyer<{ organisation: { id: number } }>("/api/pilot/organisations", "POST", creationOrganisation, {
      ...valeursOrganisation(f), ...(renseigne ? { contactPrincipal: contact } : {}),
    });
    router.push(`/pilot/organisations/${resultat.organisation.id}`);
    router.refresh();
  });
  return (
    <form onSubmit={formulaire.onSubmit} onChange={(e) => {
      const champ = e.target as HTMLInputElement;
      if (champ.name === "raisonSocialeNom") setNom(champ.value);
    }} onKeyDown={(e) => {
      formulaire.onKeyDown(e);
      if (e.key === "Escape") { e.preventDefault(); annuler(); }
    }}>
      <Stack spacing={3} sx={{ maxWidth: 760, mx: "auto" }}>
        <Typography variant="h1">Nouveau client</Typography>
        {formulaire.erreur && <Alert severity="error">{formulaire.erreur}</Alert>}
        <Card><CardContent><Stack spacing={2}>
          <Typography variant="h2">Organisation</Typography>
          <ChampsOrganisation organisation={{ raisonSocialeNom: nomInitial }} comptes={comptes} courantId={courantId} suggestions={suggestions} annuaire />
          <Doublons liste={doublons} />
        </Stack></CardContent></Card>
        <Card><CardContent><Stack spacing={2}>
          <Typography variant="h2">Contact principal, facultatif</Typography>
          <ChampsContact prefixe="contact." facultatif metiers={suggestions.metier} />
        </Stack></CardContent></Card>
        <Stack direction="row" justifyContent="flex-end" spacing={2}>
          <Button onClick={annuler}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={formulaire.envoi}>Créer</Button>
        </Stack>
      </Stack>
    </form>
  );
}

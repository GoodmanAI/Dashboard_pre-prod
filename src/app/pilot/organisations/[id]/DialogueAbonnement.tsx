"use client";

import { MenuItem, TextField, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { entierDepuisSaisie, eurosPrecis } from "@/pilot/lib/argent";
import { mensuelDepuisSaisie, type Periodicite } from "@/pilot/lib/contrats/abonnementRapide";

/**
 * Saisir l'abonnement d'un client en une fois, depuis l'en-tête de la fiche (retour de
 * Maxime, 25/11/2026). Derrière, c'est un contrat comme un autre : créé avec une ligne
 * d'abonnement par produit renseigné, puis activé. Il alimente donc le chiffre
 * d'affaires récurrent et la facturation. Le détail (remises, salles, part variable) se
 * règle ensuite dans l'onglet Argent.
 */
export function DialogueAbonnement({ organisationId, catalogue, fermer, termine }: {
  organisationId: number; catalogue: { id: number; name: string }[]; fermer: () => void; termine: (message: string) => void;
}) {
  const jour = new Date().toISOString().slice(0, 10);
  return <DialogueFormulaire titre="Saisir l'abonnement" bouton="Enregistrer l'abonnement" fermer={fermer} soumettre={async (f) => {
    const periodicite = texte(f, "periodicite") as Periodicite;
    const lignes: { productId: number; type: "ABONNEMENT"; montantCentimes: number }[] = [];
    const annuels: string[] = [];
    for (const p of catalogue) {
      const saisie = texte(f, "montant-" + p.id).trim();
      if (!saisie) continue;
      const centimes = entierDepuisSaisie(saisie, 2, `Montant ${p.name.replace(/^Lyrae/, "")}`);
      lignes.push({ productId: p.id, type: "ABONNEMENT", montantCentimes: mensuelDepuisSaisie(centimes, periodicite) });
      if (periodicite === "AN") annuels.push(`${p.name.replace(/^Lyrae/, "")} : ${eurosPrecis(centimes)} HT par an`);
    }
    if (!lignes.length) throw new Error("Indiquez le montant d'au moins un produit.");
    const debuteLe = texte(f, "debuteLe") || jour;
    const { contrat } = await envoyer<{ contrat: { id: number } }>("/api/pilot/contrats", "POST", undefined, {
      organisationId, lignes, debuteLe, signeLe: debuteLe, reference: texte(f, "reference") || null,
      conditionsTarifaires: annuels.length ? `Abonnement annuel. ${annuels.join(", ")}, compté au douzième chaque mois.` : null,
    });
    try {
      await envoyer(`/api/pilot/contrats/${contrat.id}`, "PATCH", undefined, { operation: "statut", vers: "ACTIF" });
    } catch (e) {
      throw new Error(`Le contrat est créé mais n'a pas pu être activé : ${e instanceof Error ? e.message : "réessayez"}. Activez-le dans l'onglet Argent.`);
    }
    termine("Abonnement enregistré. Il compte dans le chiffre d'affaires récurrent et la facturation.");
  }}>
    <Typography variant="body2" color="text.secondary">Le montant hors taxes que le client paie, produit par produit. Laissez vide un produit qu&apos;il n&apos;a pas.</Typography>
    <TextField name="periodicite" label="Le montant saisi est" select defaultValue="MOIS" fullWidth>
      <MenuItem value="MOIS">par mois</MenuItem>
      <MenuItem value="AN">par an (compté au douzième chaque mois)</MenuItem>
    </TextField>
    {catalogue.map((p, i) => <TextField key={p.id} name={"montant-" + p.id} label={`${p.name.replace(/^Lyrae/, "")}, en euros HT`} fullWidth autoFocus={i === 0} inputProps={CHAMP_DECIMAL} />)}
    <TextField name="debuteLe" label="Début de l'abonnement" type="date" defaultValue={jour} InputLabelProps={{ shrink: true }} fullWidth
      helperText="Le chiffre d'affaires compte à partir de ce jour." />
    <TextField name="reference" label="Référence du contrat" fullWidth inputProps={{ maxLength: 200 }} helperText="Facultatif." />
    <Typography variant="caption" color="text.secondary">Remises, prix à la salle et part variable se règlent ensuite sur le contrat, dans l&apos;onglet Argent.</Typography>
  </DialogueFormulaire>;
}

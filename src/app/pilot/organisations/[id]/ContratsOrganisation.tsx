"use client";
import { phraseRattachements } from "@/pilot/lib/centres/phrases";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import Link from "next/link";
import type { CrmContrat, CrmLigneContrat } from "@prisma/client";
import { compter } from "@/pilot/lib/texte";
import { debutDuJour } from "@/pilot/lib/dates";
import { echeancesContrat, LIBELLES_CONTRAT } from "@/pilot/lib/contrats/regles";
import { modificationContrat } from "@/pilot/lib/validation/contrat";
import { resumeGestesVente } from "@/pilot/lib/propositions/affichage";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { decrireTarif, essaiContrat, LIBELLES_RECONDUCTION } from "@/pilot/lib/ventes/regles";
import { phraseBilanOpportunites, type BilanOpportunites } from "@/pilot/lib/opportunites/regles";
import { DialogueContrat, DialogueLigneContrat, type ContratEditable } from "./DialoguesContrat";

export type LigneContratFiche = Pick<CrmLigneContrat, "id" | "productId" | "centreId" | "type" | "montantCentimes" | "unite" | "volumeInclus" | "libelle" | "offerte"
  | "quantite" | "prixUnitaireCentimes" | "baseQuantite" | "remisePourMille">;
export type ContratFiche = ContratEditable & Pick<CrmContrat, "statut"> & {
  termineLe: string | null; versionProposition: number | null; lignes: LigneContratFiche[];
};
type Dialogue = { action: "nouveau" } | { action: "modifier" | "terminer" | "supprimer"; contrat: ContratFiche }
  | { action: "ligne" | "retirer"; contrat: ContratFiche; ligne?: LigneContratFiche };
const date = (d: string | Date) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const convertirDate = (d: string | null) => d ? new Date(d) : null;
/** « Essai de 30 jours, du 3 nov. 2026 au 2 déc. 2026 » : la fin est calculée, jamais saisie. */
function texteEssai(c: ContratFiche) {
  const essai = essaiContrat({ essaiDebuteLe: convertirDate(c.essaiDebuteLe), essaiJours: c.essaiJours }, new Date());
  if (!essai) return "Pas d'essai renseigné";
  const duree = essai.jours !== null ? "Essai de " + compter(essai.jours, "jour") : "Essai de durée non renseignée";
  return duree + (essai.debut && essai.fin ? ", du " + date(essai.debut) + " au " + date(essai.fin) : essai.debut ? ", à partir du " + date(essai.debut) : ", début non renseigné");
}
export function ContratsOrganisation({ organisationId, contrats, catalogue, centres, montantsModifiables }: {
  organisationId: number; contrats: ContratFiche[]; catalogue: { id: number; name: string }[]; centres: { id: number; nom: string }[]; montantsModifiables: boolean;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Ce que l'activation, ou une ligne posée sur un contrat actif, vient de faire des opportunités (C-71).
  const [message, setMessage] = useState<string | null>(null);
  const jour = new Date().toISOString().slice(0, 10);
  function termine(texte: string | null = null) { setDialogue(null); setErreur(null); setMessage(texte); router.refresh(); }
  const termines = contrats.filter((c) => c.statut === "TERMINE");
  function afficher(c: ContratFiche) {
    const { finEngagement, limitePreavis } = echeancesContrat({ ...c, signeLe: convertirDate(c.signeLe), debuteLe: convertirDate(c.debuteLe), renouvelleLe: convertirDate(c.renouvelleLe) }, new Date());
    const modifiable = montantsModifiables && c.statut !== "TERMINE";
    return <Box key={c.id} id={"contrat-" + c.id} sx={{ borderTop: 1, borderColor: "divider", pt: 2, color: c.statut === "TERMINE" ? "text.secondary" : undefined }}>
      <Typography variant="h3">{c.reference ?? "Contrat sans référence"}</Typography>
      <Typography variant="body2">{LIBELLES_CONTRAT[c.statut]}</Typography>
      <Typography variant="body2">{c.signeLe ? "Signé le " + date(c.signeLe) : "Signature non renseignée"} · {c.debuteLe ? "Début officiel le " + date(c.debuteLe) : "Début officiel non renseigné"}</Typography>
      <Typography variant="body2">{texteEssai(c)}</Typography>
      <Typography variant="body2">{c.engagementMois !== null ? "Durée de " + compter(c.engagementMois, "mois", "mois") + " · " : ""}{finEngagement ? "Fin d'engagement le " + date(finEngagement) : "Fin d'engagement à préciser : renseignez une date de début ou de signature et une durée."}</Typography>
      <Typography variant="body2">{c.reconduction ? "Reconduction : " + LIBELLES_RECONDUCTION[c.reconduction].toLowerCase() : "Reconduction non renseignée"}</Typography>
      <Typography variant="body2" color={limitePreavis && limitePreavis < debutDuJour(new Date()) ? "warning.main" : undefined}>
        {c.preavisMois === null ? "Préavis non renseigné" : "Préavis de " + compter(c.preavisMois, "mois", "mois")}
        {limitePreavis ? (limitePreavis < debutDuJour(new Date()) ? " : préavis dépassé depuis le " : " : décider avant le ") + date(limitePreavis) : ""}
      </Typography>
      <Typography variant="body2">{c.renouvelleLe ? "Renouvellement le " + date(c.renouvelleLe) : "Renouvellement non renseigné"}</Typography>
      {c.termineLe && <Typography variant="body2">Terminé le {date(c.termineLe)}</Typography>}
      {c.conditionsTarifaires && <Typography variant="body2" sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere", mt: 0.5 }}>Conditions particulières : {c.conditionsTarifaires}</Typography>}
      {c.versionProposition !== null && <Button component={Link} href={"/pilot/organisations/" + organisationId + "?onglet=negociation"}>Issu de la proposition Version {c.versionProposition}</Button>}
      {!c.lignes.length && <Typography color="text.secondary">{c.statut === "TERMINE" ? "Aucune ligne conservée dans ce contrat terminé." : "Aucune ligne. Ajoutez un produit avant d’activer ce contrat."}</Typography>}
      {resumeGestesVente(c.lignes) && <Typography variant="body2" sx={{ mt: 1 }}>{resumeGestesVente(c.lignes)}</Typography>}
      {c.lignes.map((l) => <Box key={l.id} sx={{ mt: 1 }}>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{decrireTarif(l).libelle} : {decrireTarif(l).montant}</Typography>
        <Typography variant="caption">{l.productId === null ? "" : (catalogue.find((p) => p.id === l.productId)?.name ?? "Produit non disponible") + " · "}{l.centreId ? centres.find((c) => c.id === l.centreId)?.nom ?? "Centre non disponible" : "Toute l'organisation"}</Typography>
        {modifiable && <Stack direction="row"><Button onClick={() => setDialogue({ action: "ligne", contrat: c, ligne: l })}>Modifier</Button><Button onClick={() => setDialogue({ action: "retirer", contrat: c, ligne: l })}>Retirer</Button></Stack>}
      </Box>)}
      {modifiable && <Stack direction="row" flexWrap="wrap" sx={{ mt: 1 }}>
        <Button onClick={() => setDialogue({ action: "modifier", contrat: c })}>Modifier</Button>
        {c.statut === "BROUILLON" ? <Button disabled={envoi} onClick={async () => {
          setEnvoi(true); setErreur(null); setMessage(null);
          try {
            const { bilan, rattachementsCrees, sansCentre } = await envoyer<{ bilan: BilanOpportunites | null; rattachementsCrees: number; sansCentre: string | null }>("/api/pilot/contrats/" + c.id, "PATCH", modificationContrat, { operation: "statut", vers: "ACTIF" });
            termine(["Contrat activé.", bilan && phraseBilanOpportunites(bilan)].filter(Boolean).join(" ") + phraseRattachements(rattachementsCrees, sansCentre));
          }
          catch (e) { setErreur(e instanceof Error ? e.message : "L'activation a échoué."); } finally { setEnvoi(false); }
        }}>Activer</Button> : <Button onClick={() => setDialogue({ action: "terminer", contrat: c })}>Terminer</Button>}
        <Button onClick={() => setDialogue({ action: "ligne", contrat: c })}>Ajouter une ligne</Button>
        {c.statut === "BROUILLON" && <Button onClick={() => setDialogue({ action: "supprimer", contrat: c })}>Supprimer</Button>}
      </Stack>}
    </Box>;
  }
  return <Stack spacing={2} sx={{ mt: 3 }}>
    <Typography variant="h2">Contrats</Typography>
    {erreur && <Alert icon={false} severity="error">{erreur}</Alert>}
    {message && <Alert icon={false} severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
    {!contrats.length && <Typography color="text.secondary">Aucun contrat. Il se crée à l&apos;acceptation d&apos;une proposition, ou ici.</Typography>}
    {contrats.filter((c) => c.statut !== "TERMINE").map(afficher)}
    {!!termines.length && <Box component="details"><Box component="summary" sx={{ cursor: "pointer" }}>Contrats terminés ({termines.length})</Box><Stack spacing={2}>{termines.map(afficher)}</Stack></Box>}
    {montantsModifiables && <Box><Button onClick={() => setDialogue({ action: "nouveau" })}>Nouveau contrat</Button></Box>}
    {(dialogue?.action === "nouveau" || dialogue?.action === "modifier") && <DialogueContrat organisationId={organisationId} contrat={dialogue.action === "modifier" ? dialogue.contrat : undefined} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.action === "ligne" && <DialogueLigneContrat contratId={dialogue.contrat.id} ligne={dialogue.ligne} catalogue={catalogue} centres={centres} fermer={() => setDialogue(null)}
      termine={(bilan) => termine(bilan?.gagnees ? [dialogue.ligne ? "Ligne modifiée." : "Ligne ajoutée.", phraseBilanOpportunites(bilan)].join(" ") : null)} />}
    {dialogue && ["terminer", "supprimer", "retirer"].includes(dialogue.action) && "contrat" in dialogue && <DialogueFormulaire
      titre={dialogue.action === "terminer" ? "Terminer le contrat" : dialogue.action === "retirer" ? "Retirer cette ligne ?" : "Supprimer ce brouillon ?"}
      bouton={dialogue.action === "terminer" ? "Terminer" : dialogue.action === "retirer" ? "Retirer" : "Supprimer"} suppression={dialogue.action !== "terminer"}
      fermer={() => setDialogue(null)} soumettre={async (f) => {
        const url = "/api/pilot/contrats/" + dialogue.contrat.id;
        if (dialogue.action === "terminer") await envoyer(url, "PATCH", modificationContrat, { operation: "statut", vers: "TERMINE", le: f.get("le") });
        else await envoyer(url + (dialogue.action === "retirer" ? "/lignes/" + dialogue.ligne!.id : ""), "DELETE");
        termine();
      }}>
      {dialogue.action === "terminer" ? <>
        <TextField name="le" label="Date de fin" type="date" autoFocus required defaultValue={jour} InputLabelProps={{ shrink: true }} inputProps={{ min: dialogue.contrat.signeLe?.slice(0, 10), max: jour }}
          helperText="Aujourd'hui au plus tard. Une fin à venir se pose le jour venu." />
        <Typography>La projection de chiffre d&apos;affaires s&apos;arrêtera à cette date.</Typography>
      </> : <Typography>{dialogue.action === "retirer" ? "Cette ligne sera retirée du contrat." : "Ce brouillon et ses lignes seront supprimés."}</Typography>}
    </DialogueFormulaire>}
  </Stack>;
}

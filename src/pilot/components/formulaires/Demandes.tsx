"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { IconSend } from "@tabler/icons-react";
import type { CrmCleEtape, CrmTypeDemande } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";
import { signalerPourVous } from "@/pilot/components/pourVous";
import { Ligne } from "@/pilot/components/Bloc";
import { LIBELLES_DEMANDE, LIBELLES_STATUT_DEMANDE, TYPES_DEMANDE, enRetard, typeSuggere } from "@/pilot/lib/demandes/regles";
import { nouvelleDemande, operationDemande } from "@/pilot/lib/validation/demande";
import { dateCourte } from "@/pilot/lib/integration/estimation";
import type { LigneDemande as Demande } from "@/pilot/lib/demandes/charger";

export type Personne = { id: number; name: string | null };
export type Moi = { id: number; role: string };

/** « Demander à… » : ouvre le dialogue. Depuis une étape, le type le plus probable est déjà choisi. */
export function BoutonDemander({ organisationId, comptes, moi, etape, libelle = "Demander à…", variante = "outlined" }: {
  organisationId: number; comptes: Personne[]; moi: Moi;
  etape?: { cle: CrmCleEtape; id: number | null; centreProduitId: number }; libelle?: string; variante?: "outlined" | "text";
}) {
  const [ouvert, setOuvert] = useState(false);
  return <>
    <Button variant={variante} startIcon={<IconSend size={16} />} onClick={() => setOuvert(true)}>{libelle}</Button>
    {ouvert && <DialogueDemande organisationId={organisationId} comptes={comptes} moi={moi} etape={etape} fermer={() => setOuvert(false)} />}
  </>;
}

function DialogueDemande({ organisationId, comptes, moi, etape, fermer }: {
  organisationId: number; comptes: Personne[]; moi: Moi; etape?: { cle: CrmCleEtape; id: number | null; centreProduitId: number }; fermer: () => void;
}) {
  const router = useRouter();
  const autres = comptes.filter((c) => c.id !== moi.id);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return <DialogueFormulaire titre="Demander à un collègue" bouton="Envoyer la demande" fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/demandes", "POST", nouvelleDemande, {
      organisationId, type: String(f.get("type")) as CrmTypeDemande, destinataireId: Number(f.get("destinataireId")),
      echeanceLe: String(f.get("echeanceLe") ?? "") || null, precisions: String(f.get("precisions") ?? ""),
      ...(etape ? { centreProduitId: etape.centreProduitId, etapeIntegrationId: etape.id } : {}),
    });
    fermer(); router.refresh(); signalerPourVous();
  }}>
    <TextField name="type" label="Quoi" select required fullWidth defaultValue={typeSuggere(etape?.cle)}>
      {TYPES_DEMANDE.map((t) => <MenuItem key={t} value={t}>{LIBELLES_DEMANDE[t]}</MenuItem>)}
    </TextField>
    <TextField name="destinataireId" label="À qui" select required fullWidth defaultValue={autres[0]?.id ?? ""}
      helperText={autres.length ? "La personne la voit dans Aujourd'hui et dans Demandes." : "Personne d'autre dans l'équipe pour l'instant."}>
      {autres.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Sans nom"}</MenuItem>)}
    </TextField>
    <TextField name="echeanceLe" label="Pour quand" type="date" fullWidth InputLabelProps={{ shrink: true }} inputProps={{ min: aujourdhui }}
      helperText="Facultatif. Passée la date, la demande s'affiche en rouge." />
    <TextField name="precisions" label="Précisions" multiline minRows={3} fullWidth inputProps={{ maxLength: 1000 }}
      helperText="Ce qu'il faut savoir pour agir. Jamais de donnée patient." />
  </DialogueFormulaire>;
}

/** Une demande dans une liste : ce qu'il faut faire, pour quel client, de qui à qui, et les actions permises. */
export function LigneDemande({ demande: d, moi, afficherClient = true }: { demande: Demande; moi: Moi; afficherClient?: boolean }) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<"faite" | "annuler" | null>(null);
  const jour = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const retard = enRetard(d, jour);
  const superAdmin = moi.role === "SUPER_ADMIN";
  const peutFaire = d.statut === "OUVERTE" && (d.destinataireId === moi.id || superAdmin);
  const peutAnnuler = d.statut === "OUVERTE" && (d.demandeurId === moi.id || superAdmin);
  const pourMoi = d.destinataireId === moi.id;
  const qui = pourMoi ? `De ${d.demandeur}` : d.demandeurId === moi.id ? `Pour ${d.destinataire}` : `${d.demandeur} pour ${d.destinataire}`;
  return <>
    <Ligne data-demande={d.id}
      nom={<>{LIBELLES_DEMANDE[d.type]}{d.statut !== "OUVERTE" && <Chip label={LIBELLES_STATUT_DEMANDE[d.statut]} color={d.statut === "FAITE" ? "success" : "default"} sx={{ ml: 1 }} />}</>}
      detail={<>
        <Box>{afficherClient && <><Link href={`/pilot/organisations/${d.organisationId}`}>{d.organisationNom}</Link> · </>}{qui}</Box>
        {d.precisions && <Box sx={{ color: "text.primary", mt: 0.5, whiteSpace: "pre-line" }}>{d.precisions}</Box>}
        {d.reponse && <Box sx={{ mt: 0.5 }}>Réponse : {d.reponse}</Box>}
      </>}
      date={d.statut === "OUVERTE"
        ? (d.echeanceLe ? <Box component="span" sx={retard ? { color: "error.main", fontWeight: 600 } : undefined}>{retard ? "En retard · " : "Pour le "}{dateCourte(d.echeanceLe)}</Box> : "Sans échéance")
        : d.traiteeLe ? dateCourte(d.traiteeLe) : undefined}>
      {peutFaire && <Button variant={pourMoi ? "outlined" : "text"} onClick={() => setDialogue("faite")}>Fait</Button>}
      {peutAnnuler && <Button onClick={() => setDialogue("annuler")}>Annuler</Button>}
    </Ligne>
    {dialogue === "faite" && <DialogueFormulaire titre="Marquer la demande faite" bouton="Marquer faite" fermer={() => setDialogue(null)} soumettre={async (f) => {
      await envoyer(`/api/pilot/demandes/${d.id}`, "PATCH", operationDemande, { operation: "faite", reponse: String(f.get("reponse") ?? "") });
      setDialogue(null); router.refresh(); signalerPourVous();
    }}>
      <Typography>{LIBELLES_DEMANDE[d.type]} · {d.organisationNom}</Typography>
      <TextField name="reponse" label="Réponse" multiline minRows={2} fullWidth autoFocus inputProps={{ maxLength: 1000 }}
        // Focus pris pendant l'ouverture animée : l'étiquette reste en haut pour ne pas chevaucher le texte.
        InputLabelProps={{ shrink: true }}
        helperText={`Facultatif. ${d.demandeur} la verra dans ses demandes.`} />
    </DialogueFormulaire>}
    {dialogue === "annuler" && <DialogueFormulaire titre="Annuler cette demande ?" bouton="Annuler la demande" suppression fermer={() => setDialogue(null)} soumettre={async () => {
      await envoyer(`/api/pilot/demandes/${d.id}`, "PATCH", operationDemande, { operation: "annuler" });
      setDialogue(null); router.refresh(); signalerPourVous();
    }}>
      <Typography>{d.destinataire} ne la verra plus dans ses demandes à faire. Elle reste dans l&apos;historique.</Typography>
    </DialogueFormulaire>}
  </>;
}

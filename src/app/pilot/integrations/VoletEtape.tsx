"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox, Divider, Drawer, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { CaseIntegration, LigneIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import { LIBELLES_TIERS, ORDRE_TIERS, libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { envoyer, useFormulaire } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ActionsAttente } from "@/pilot/components/formulaires/ActionsAttente";
import { BoutonDemander, type Moi, type Personne } from "@/pilot/components/formulaires/Demandes";
import Link from "next/link";
import type { CrmCleEtape } from "@prisma/client";

/** Ce que le commentaire doit contenir, quand l'étape le précise. Jamais de donnée patient. */
const COMMENTAIRES: Partial<Record<CrmCleEtape, string>> = {
  PASSATION: "Ce qui a été promis au client",
  FORMATION_SECRETAIRES: "Liste des présents",
  FORMATION_DASHBOARD: "Liste des présents",
  FORMATION_CONFIRMEE: "Qui a confirmé, et quand",
  BILAN_M1: "Chiffres du mois : appels traités, RDV pris, renvois vers un humain, absences",
};
const dateLongue = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function VoletEtape({ ligne, etape, fermer, comptes, moi }: { ligne: LigneIntegration; etape: CaseIntegration; fermer: () => void; comptes: Personne[]; moi: Moi }) {
  const router = useRouter();
  const [faite, setFaite] = useState(etape.faite);
  const automatique = etape.mode === "AUTOMATIQUE";
  function fini() { router.refresh(); fermer(); }
  const cochage = useFormulaire(async (d) => {
    await envoyer("/api/pilot/etapes", "POST", undefined, { centreId: ligne.centreId, productId: ligne.productId,
      cle: etape.cle, faite, commentaire: String(d.get("commentaire") ?? "") });
    fini();
  });
  const attente = useFormulaire(async (d) => {
    let id = etape.id;
    // Une case absente peut être ouverte par une action humaine explicite.
    if (id === null) {
      const resultat = await envoyer<{ etape: { id: number } }>("/api/pilot/etapes", "POST", undefined,
        { centreId: ligne.centreId, productId: ligne.productId, cle: etape.cle, faite: false });
      id = resultat.etape.id;
    }
    await envoyer(`/api/pilot/etapes/${id}/attente`, "PATCH", undefined, { operation: "declarer", enAttenteDe: d.get("enAttenteDe"),
      demandeeLe: d.get("demandeeLe") || undefined, echeanceLe: d.get("echeanceLe") || null });
    fini();
  });
  return <Drawer anchor="right" open onClose={fermer} PaperProps={{ role: "dialog", "aria-labelledby": "titre-etape", sx: { width: { xs: "100%", sm: 480 }, p: 3, pt: 10, borderLeft: 1, borderColor: "divider" } }}>
    <Stack spacing={2}>
      <Typography id="titre-etape" variant="h2">{etape.libelle}</Typography>
      <Typography color="text.secondary">{ligne.centreNom} · {ligne.produit}</Typography>
      <Typography>{etape.faite ? "Faite" : "À faire"}{etape.faiteLe ? ` le ${new Date(etape.faiteLe).toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : ""}</Typography>
      {etape.motif && <Alert severity="info" icon={false}>{etape.motif}</Alert>}
      {etape.attendMiseEnService && !etape.faite && <Alert severity="info" icon={false}>Cette étape suit la mise en service. Elle se coche une fois « Mise en service déclarée » cochée.</Alert>}
      {etape.prevueLe && !etape.faite && <Typography variant="body2">Prévue le {dateLongue(etape.prevueLe)}.</Typography>}
      {etape.cle === "LISTE_ELEMENTS" && !etape.faite && <Typography variant="body2">Notez la date limite du paramétrage en échéance d&apos;une attente du client, plus bas.</Typography>}
      {etape.cle === "DATE_DEMARRAGE_CONFIRMEE" && !etape.faite && <Typography variant="body2">Elle se coche quand toutes les étapes bloquantes des phases précédentes sont faites et que le centre a une date promise.</Typography>}
      {etape.cle === "TOP_FACTURATION" && <Typography variant="body2">
        {ligne.estimation.miseEnProductionLe ? `Mis en service le ${dateLongue(ligne.estimation.miseEnProductionLe)}. ` : ""}
        Après l&apos;envoi, reportez cette date comme début du contrat, dans l&apos;onglet Argent de la <Link href={`/pilot/organisations/${ligne.organisationId}?onglet=argent`}>fiche du compte</Link>.
      </Typography>}
      <Typography variant="body2">Source : {etape.source}.</Typography>
      {/* Un collègue peut débloquer l'étape : la demande la plus probable est déjà choisie (C-58). */}
      {!etape.faite && <Box><BoutonDemander organisationId={ligne.organisationId} comptes={comptes} moi={moi}
        etape={{ cle: etape.cle, id: etape.id, centreProduitId: ligne.centreProduitId }} libelle="Demander à un collègue" /></Box>}
      {automatique ? <Typography>Cette étape se met à jour automatiquement. Elle ne se coche pas à la main.</Typography> : <>
        {etape.mode === "MIXTE" && <Typography variant="body2">Le numéro est vérifié automatiquement. Cochez la case après les essais.</Typography>}
        <Box component="form" onSubmit={cochage.onSubmit} onKeyDown={cochage.onKeyDown}>
          <Stack spacing={2}>
            {cochage.erreur && <Alert severity="error">{cochage.erreur}</Alert>}
            <FormControlLabel control={<Checkbox autoFocus checked={faite} disabled={etape.attendMiseEnService && !etape.faite} onChange={(e) => setFaite(e.target.checked)} />} label="Étape faite" />
            <TextField name="commentaire" label={COMMENTAIRES[etape.cle] ?? "Commentaire"} multiline minRows={2} defaultValue={etape.commentaire ?? ""} />
            <Button type="submit" variant="contained" disabled={cochage.envoi}>Enregistrer la case</Button>
          </Stack>
        </Box>
      </>}
      <Divider />
      {etape.faite ? <Typography>Cette étape est faite : il n&apos;y a plus rien à attendre.</Typography>
        : automatique && etape.id === null ? <Typography variant="body2">Une attente se déclare après la première vérification de cette étape. Cliquez sur « Vérifier maintenant ».</Typography> : <>
        <Typography variant="h3">{etape.enAttenteDe ? libelleAttente(etape.enAttenteDe) : "Déclarer une attente"}</Typography>
        <Box component="form" onSubmit={attente.onSubmit} onKeyDown={attente.onKeyDown}>
          <Stack spacing={2}>
            {attente.erreur && <Alert severity="error">{attente.erreur}</Alert>}
            <TextField select name="enAttenteDe" label="En attente de" defaultValue={etape.enAttenteDe ?? "CLIENT"}>
              {ORDRE_TIERS.map((t) => <MenuItem key={t} value={t}>{LIBELLES_TIERS[t]}</MenuItem>)}
            </TextField>
            <TextField name="demandeeLe" type="date" label="Demandée le" InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }} defaultValue={etape.demandeeLe?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} />
            <TextField name="echeanceLe" type="date" label="Échéance facultative" InputLabelProps={{ shrink: true }} defaultValue={etape.echeanceLe?.slice(0, 10) ?? ""} />
            <Button type="submit" variant="outlined" disabled={attente.envoi}>Enregistrer l&apos;attente</Button>
          </Stack>
        </Box>
        {etape.enAttenteDe && etape.id && <ActionsAttente id={etape.id} libelle="Relancé aujourd'hui" apres={fini} />}
      </>}
      <Button autoFocus={automatique} onClick={fermer}>Fermer</Button>
    </Stack>
  </Drawer>;
}

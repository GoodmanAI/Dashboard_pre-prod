"use client";
import { useState } from "react";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { CrmEtapeCommerciale, CrmOpportunite } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { centimesDepuisSaisie, eurosPrecis, pondere, saisieEuros } from "@/pilot/lib/argent";
import { PROBABILITE_PAR_ETAPE, probabiliteEffective } from "@/pilot/lib/pipeline";
import { LIBELLES_PREVISION } from "@/pilot/lib/opportunites/regles";
import { creationOpportunite, modificationOpportunite } from "@/pilot/lib/validation/opportunite";

export type OpportuniteFiche = Pick<CrmOpportunite, "id" | "productId" | "libelle" | "montantMensuelCentimes" | "montantMiseEnServiceCentimes" | "probabilite" | "probabiliteForcee" | "categoriePrevision" | "raisonPerte"> & {
  demarrageAttenduLe: string | null; gagneeLe: string | null; perdueLe: string | null;
};
type Dialogue = { action: "nouvelle" } | { action: "modifier" | "gagnee" | "perdue"; opportunite: OpportuniteFiche };
export function OpportunitesOrganisation({ organisationId, opportunites, etape, catalogue, montantsModifiables }: {
  organisationId: number; opportunites: OpportuniteFiche[]; etape: CrmEtapeCommerciale; catalogue: { id: number; name: string }[]; montantsModifiables: boolean;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  function termine() { setDialogue(null); setErreur(null); router.refresh(); }
  const ouvertes = opportunites.filter((o) => !o.gagneeLe && !o.perdueLe);
  const conclues = opportunites.filter((o) => o.gagneeLe || o.perdueLe);
  const probabiliteDe = (o: OpportuniteFiche) => probabiliteEffective(o, etape);
  function afficher(o: OpportuniteFiche) {
    const conclue = !!(o.gagneeLe || o.perdueLe);
    const probabilite = conclue ? o.probabilite : probabiliteDe(o);
    return <Box key={o.id} sx={{ borderTop: 1, borderColor: "divider", pt: 2, color: conclue ? "text.secondary" : undefined }}>
      <Typography variant="h3">{o.libelle ?? "Opportunité sans libellé"}</Typography>
      <Typography variant="body2">{catalogue.find((p) => p.id === o.productId)?.name ?? "Produit non disponible"}</Typography>
      <Typography>{eurosPrecis(o.montantMensuelCentimes)} par mois · {o.montantMiseEnServiceCentimes ? `Frais d'installation : ${eurosPrecis(o.montantMiseEnServiceCentimes)}` : "Sans frais d'installation"}</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Typography variant="body2">Probabilité : {probabilite} %{o.probabiliteForcee ? " · corrigée à la main" : " · selon l'étape"}</Typography>
        <Typography variant="body2">Prévision : {LIBELLES_PREVISION[o.categoriePrevision]}</Typography>
      </Stack>
      <Typography variant="body2">Probable : {eurosPrecis(pondere(o.montantMensuelCentimes, probabilite))} par mois</Typography>
      <Typography variant="body2">{o.demarrageAttenduLe ? "Démarrage attendu : " + new Date(o.demarrageAttenduLe).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }) : "Démarrage attendu à préciser pour la projection."}</Typography>
      {conclue && <Typography variant="body2">{o.gagneeLe ? "Gagnée" : "Perdue"}{o.raisonPerte ? " : " + o.raisonPerte : ""}</Typography>}
      {!conclue && montantsModifiables && <Stack direction="row" flexWrap="wrap">
        <Button onClick={() => setDialogue({ action: "modifier", opportunite: o })}>Modifier</Button>
        {o.probabiliteForcee && <Button disabled={envoi} onClick={async () => {
          setEnvoi(true); setErreur(null);
          try { await envoyer("/api/pilot/opportunites/" + o.id, "PATCH", modificationOpportunite, { operation: "modifier", revenirALEtape: true }); termine(); }
          catch (e) { setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué."); } finally { setEnvoi(false); }
        }}>Revenir à l&apos;étape</Button>}
        <Button onClick={() => setDialogue({ action: "gagnee", opportunite: o })}>Gagnée</Button>
        <Button onClick={() => setDialogue({ action: "perdue", opportunite: o })}>Perdue</Button>
      </Stack>}
    </Box>;
  }
  return <Stack spacing={2} sx={{ mt: 4 }}>
    <Typography variant="h2">Opportunités</Typography>
    {erreur && <Alert icon={false} severity="error">{erreur}</Alert>}
    {!opportunites.length && <Typography color="text.secondary">Aucune opportunité. Chiffrez ce que le client pourrait signer.</Typography>}
    {!!opportunites.length && !ouvertes.length && <Typography color="text.secondary">Aucune opportunité ouverte. Les opportunités conclues sont conservées ci-dessous.</Typography>}
    {ouvertes.map(afficher)}
    {!!conclues.length && <Box component="details"><Box component="summary" sx={{ cursor: "pointer" }}>Opportunités conclues ({conclues.length})</Box><Stack spacing={2}>{conclues.map(afficher)}</Stack></Box>}
    {montantsModifiables && <Box><Button onClick={() => setDialogue({ action: "nouvelle" })}>Nouvelle opportunité</Button></Box>}
    {(dialogue?.action === "nouvelle" || dialogue?.action === "modifier") && <DialogueOpportunite organisationId={organisationId} etape={etape} catalogue={catalogue}
      opportunite={dialogue.action === "modifier" ? dialogue.opportunite : undefined} fermer={() => setDialogue(null)} termine={termine} />}
    {(dialogue?.action === "gagnee" || dialogue?.action === "perdue") && <DialogueFormulaire titre={dialogue.action === "gagnee" ? "Opportunité gagnée" : "Opportunité perdue"} bouton="Confirmer" fermer={() => setDialogue(null)} soumettre={async (f) => {
      await envoyer("/api/pilot/opportunites/" + dialogue.opportunite.id, "PATCH", modificationOpportunite, { operation: "conclure", issue: dialogue.action,
        ...(dialogue.action === "perdue" ? { raisonPerte: texte(f, "raisonPerte") } : {}) });
      termine();
    }}>
      {dialogue.action === "perdue" ? <TextField name="raisonPerte" label="Raison de perte" autoFocus required inputProps={{ maxLength: 500 }} /> :
        <Typography>Cette opportunité sera marquée gagnée et ne sera plus modifiable.</Typography>}
    </DialogueFormulaire>}
  </Stack>;
}
function DialogueOpportunite({ organisationId, opportunite: o, etape, catalogue, fermer, termine }: {
  organisationId: number; opportunite?: OpportuniteFiche; etape: CrmEtapeCommerciale; catalogue: { id: number; name: string }[]; fermer: () => void; termine: () => void;
}) {
  const [probaModifiee, setProbaModifiee] = useState(false);
  const initiale = o ? probabiliteEffective(o, etape) : PROBABILITE_PAR_ETAPE[etape];
  return <DialogueFormulaire titre={o ? "Modifier l'opportunité" : "Nouvelle opportunité"} fermer={fermer} soumettre={async (f) => {
    function montant(champ: string, libelle: string) {
      try { return centimesDepuisSaisie(texte(f, champ)); } catch { throw new Error("Vérifiez le champ « " + libelle + " »."); }
    }
    const proba = texte(f, "probabilite");
    await envoyer(o ? "/api/pilot/opportunites/" + o.id : "/api/pilot/opportunites", o ? "PATCH" : "POST", o ? modificationOpportunite : creationOpportunite, {
      ...(o ? { operation: "modifier" } : { organisationId }), libelle: texte(f, "libelle"), productId: Number(f.get("productId")),
      montantMensuelCentimes: montant("mensuel", "Montant mensuel en euros"), montantMiseEnServiceCentimes: montant("miseEnService", "Frais d'installation en euros"),
      categoriePrevision: texte(f, "categoriePrevision"), demarrageAttenduLe: texte(f, "demarrage") ? texte(f, "demarrage") + "-01" : null,
      ...(proba !== "" && (!o || probaModifiee) ? { probabilite: Number(proba) } : {}),
    });
    termine();
  }}>
    <TextField name="libelle" label="Libellé, facultatif" autoFocus defaultValue={o?.libelle ?? ""} inputProps={{ maxLength: 500 }} />
    <TextField name="productId" label="Produit" select required defaultValue={o?.productId ?? catalogue[0]?.id ?? ""}>{catalogue.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}</TextField>
    <TextField name="mensuel" label="Montant mensuel en euros" required defaultValue={saisieEuros(o?.montantMensuelCentimes ?? 0)} inputProps={CHAMP_DECIMAL} />
    <TextField name="miseEnService" label="Frais d'installation en euros" required defaultValue={saisieEuros(o?.montantMiseEnServiceCentimes ?? 0)} inputProps={CHAMP_DECIMAL} />
    <TextField name="probabilite" label="Probabilité en pourcentage" type="number" defaultValue={initiale} onChange={() => setProbaModifiee(true)} inputProps={{ min: 0, max: 100, step: 1 }} helperText={"Probabilité de l'étape : " + PROBABILITE_PAR_ETAPE[etape] + " %."} />
    <TextField name="categoriePrevision" label="Niveau de confiance" select defaultValue={o?.categoriePrevision ?? "POSSIBLE"}>{Object.entries(LIBELLES_PREVISION).map(([v, label]) => <MenuItem key={v} value={v}>{label}</MenuItem>)}</TextField>
    <TextField name="demarrage" label="Mois de démarrage attendu" type="month" defaultValue={o?.demarrageAttenduLe?.slice(0, 7) ?? ""} InputLabelProps={{ shrink: true }} />
  </DialogueFormulaire>;
}

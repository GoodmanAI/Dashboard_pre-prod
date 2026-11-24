"use client";
import { phraseRattachements } from "@/pilot/lib/centres/phrases";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Box, Button, Card, CardContent, Chip, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import type { CrmEtapeCommerciale, CrmLigneProposition, CrmProposition } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { creationVersion, modificationProposition, acceptationProposition } from "@/pilot/lib/validation/proposition";
import { LIBELLES_PROPOSITION, propositionEnAttente, totauxProposition, versionQuiRemplace } from "@/pilot/lib/propositions/regles";
import { estAChiffrer, phraseAChiffrer, resumeGestesVente } from "@/pilot/lib/propositions/affichage";
import { decrireTarif } from "@/pilot/lib/ventes/regles";
import { jourFr } from "@/pilot/lib/tarifs/affichage";
import { LIBELLES, cheminVersSigne, estClient, probabiliteEffective } from "@/pilot/lib/pipeline";
import { dansJours } from "@/pilot/lib/dates";
import { eurosPrecis } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
import { DialogueProposition, saisieRemise, type PreremplissageEcran, type RemarqueEcran } from "./DialogueProposition";
import { PlanSignature, type JalonFiche } from "./PlanSignature";
import { MontantsProposition, RecapitulatifProposition } from "./MontantsProposition";
import type { OpportuniteFiche } from "./OpportunitesOrganisation";
import { RIEN_NE_CHANGE } from "./ConvertirClient";

export type PropositionFiche = Pick<CrmProposition, "id" | "version" | "statut" | "remisePourMille" | "engagementMois" | "preavisMois" | "documentUrl" | "reponseClient" | "notes">
  & { envoyeeLe: string | null; valideJusquAu: string | null; lignes: CrmLigneProposition[]; contratId: number | null;
    /** La version lue (ISO) : le préremplissage d'un brouillon la renvoie, 409 si elle a changé. */
    majLe: string };
/** Un brouillon qui a déjà des lignes n'est pas repris à l'acceptation : la boîte le signale, comme les contrats actifs. */
export const BROUILLON_EXISTANT = "Un contrat en brouillon existe déjà : vérifiez-le dans l'onglet Argent.";
/**
 * `remarques` : ce que le préremplissage vient de dire, montré à l'ouverture du
 * dialogue de la version qu'il a créée. `grillePreremplie` : le jour de la grille
 * réellement utilisée, que la réponse du serveur donne.
 */
type Dialogue = { action: "modifier" | "envoyer" | "accepter" | "refuser"; proposition: PropositionFiche; remarques?: RemarqueEcran[]; grillePreremplie?: string | null };
const date = (s: string) => new Date(s).toLocaleDateString("fr-FR", { timeZone: "UTC" });

export function NegociationOrganisation({ organisationId, etape, propositions, opportunites, jalons, catalogue, centres, montantsModifiables, contratsActifs, brouillons = [], grilleDu = null, acceptation = null, acceptationOuverte }: {
  organisationId: number; etape: CrmEtapeCommerciale; propositions: PropositionFiche[]; opportunites: OpportuniteFiche[]; jalons: JalonFiche[]; contratsActifs: { id: number; reference: string | null }[];
  /** Les contrats en brouillon et leur nombre de lignes : un brouillon vide est repris à l'acceptation, un autre est signalé. */
  brouillons?: { id: number; lignes: number }[];
  /** Le jour d'application de la grille tarifaire en vigueur (« AAAA-MM-JJ »), null s'il n'y en a aucune : la version préremplie s'en sert. */
  grilleDu?: string | null;
  catalogue: { id: number; name: string }[]; centres: { id: number; nom: string }[]; montantsModifiables: boolean;
  /** Demandée par « Convertir en client » dans l'en-tête : la proposition dont on ouvre l'acceptation. */
  acceptation?: number | null; acceptationOuverte?: () => void;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const brouillon = propositions.some((p) => p.statut === "BROUILLON");
  const derniereEnvoyee = propositions.findIndex((p) => p.statut !== "BROUILLON");
  // Seule la version qui attend une réponse s'accepte, se refuse ou passe en discussion (garde serveur, `exigerVersionEnAttente`).
  const enAttente = propositionEnAttente(propositions);
  const chemin = cheminVersSigne(etape);
  const client = estClient(etape);
  const brouillonVide = brouillons.some((b) => !b.lignes);
  const brouillonAvecLignes = brouillons.some((b) => b.lignes > 0);
  useEffect(() => {
    if (acceptation === null) return;
    const proposition = propositions.find((p) => p.id === acceptation);
    if (proposition) setDialogue({ action: "accepter", proposition });
    acceptationOuverte?.();
  }, [acceptation, propositions, acceptationOuverte]);
  /** Crée la version, vide ou préremplie depuis la grille en vigueur, et ouvre son dialogue. Le serveur dit pourquoi une ligne manque. */
  const creer = (preremplir: boolean) => void agir(async () => {
    const { proposition, preremplissage } = await envoyer<{ proposition: PropositionFiche; preremplissage?: PreremplissageEcran | null }>(
      "/api/pilot/propositions", "POST", creationVersion, { organisationId, ...(preremplir ? { preremplir: true } : {}) });
    setDialogue({ action: "modifier", proposition: { ...proposition, contratId: null }, remarques: preremplissage?.remarques, grillePreremplie: preremplissage?.applicableLe ?? null });
    router.refresh();
  });
  function termine(texte: string) { setDialogue(null); setMessage(texte); router.refresh(); }
  async function agir(action: () => Promise<void>) {
    setEnvoi(true); setErreur(null);
    try { await action(); } catch (e) { setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué."); }
    finally { setEnvoi(false); }
  }
  return <Stack spacing={3}>
    {!montantsModifiables && <Typography color="text.secondary">Montants en lecture seule pour votre rôle.</Typography>}
    {erreur && <Alert icon={false} severity="error">{erreur}</Alert>}
    {message && <Alert icon={false} severity="success">{message}</Alert>}
    <Box>
      <Typography variant="h2" gutterBottom>Propositions</Typography>
      {!propositions.length && <Typography color="text.secondary">Aucune proposition. Préparez la première version.</Typography>}
      {montantsModifiables && <>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
          <Button variant="outlined" disabled={envoi || brouillon} onClick={() => creer(false)}>Nouvelle version</Button>
          {grilleDu && <Button variant="outlined" disabled={envoi || brouillon} onClick={() => creer(true)} sx={{ textAlign: "left", whiteSpace: "normal", maxWidth: "100%" }}>
            Nouvelle version préremplie
          </Button>}
        </Stack>
        {grilleDu && !brouillon && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
          Préremplie avec la grille tarifaire du {jourFr(grilleDu)}, d&apos;après les centres, leurs salles et leurs offres.
        </Typography>}
        {brouillon && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>Une version en brouillon existe déjà. Modifiez-la pour changer ses lignes{grilleDu ? " ou la préremplir avec la grille" : ""}.</Typography>}
        {!grilleDu && !brouillon && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
          Aucune grille tarifaire en vigueur : la version ne peut pas être préremplie. Créez la grille sur la page <Link href="/pilot/tarifs">Tarifs</Link>.
        </Typography>}
      </>}
    </Box>
    {propositions.map((p, index) => {
      const totaux = totauxProposition(p.lignes, p.remisePourMille);
      const precedente = index === derniereEnvoyee ? propositions[index + 1] : undefined;
      const gestes = resumeGestesVente(p.lignes);
      const aChiffrer = p.statut === "BROUILLON" ? phraseAChiffrer(p.lignes.filter(estAChiffrer).length) : null;
      // Une ancienne version restée envoyée ou en discussion : la négociation se poursuit sur une version plus récente.
      const remplacee = ["ENVOYEE", "EN_DISCUSSION"].includes(p.statut) ? versionQuiRemplace(propositions, p) : null;
      const difference = precedente ? totaux.abonnementMensuelCentimes - totauxProposition(precedente.lignes, precedente.remisePourMille).abonnementMensuelCentimes : 0;
      return <Card key={p.id}><CardContent>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h3">Version {p.version}</Typography>
          <Chip size="small" variant="outlined" label={LIBELLES_PROPOSITION[p.statut]} color={p.statut === "ACCEPTEE" ? "success" : "default"} />
        </Stack>
        {remplacee && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Remplacée par la version {remplacee.version}.
        </Typography>}
        <MontantsProposition totaux={totaux} />
        {!p.lignes.length && <Typography variant="body2" color="text.secondary">Aucune ligne. Complétez cette version avant l&apos;envoi.</Typography>}
        <Typography variant="body2" color="text.secondary">{p.remisePourMille ? `Remise ${saisieRemise(p.remisePourMille)} %` : "Sans remise"}</Typography>
        {gestes && <Typography variant="body2" color="text.secondary">{gestes}</Typography>}
        {aChiffrer && <Typography variant="body2" color="warning.main">{aChiffrer}</Typography>}
        {!!p.lignes.length && <Box component="details" sx={{ mt: 0.5 }}>
          <Box component="summary" sx={{ cursor: "pointer", fontSize: 14, color: "primary.main", py: 0.25 }}>Voir les lignes et le détail des montants</Box>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {p.lignes.map((l) => {
              const t = decrireTarif(l);
              return <Box key={l.id} data-ligne-proposition={l.id}>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{t.libelle} : {t.montant}</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
                  {l.productId === null ? "Hors catalogue" : catalogue.find((c) => c.id === l.productId)?.name ?? "Produit non disponible"}
                  {" · "}{l.centreId ? centres.find((c) => c.id === l.centreId)?.nom ?? "Centre non disponible" : "Toute l'organisation"}
                  {p.statut === "BROUILLON" && estAChiffrer(l) ? " · Prix à renseigner" : ""}
                </Typography>
              </Box>;
            })}
            <Typography variant="body2" fontWeight={600} sx={{ pt: 0.5 }}>Détail des montants, hors taxe</Typography>
            <RecapitulatifProposition totaux={totaux} />
          </Stack>
        </Box>}
        <Typography variant="body2" color="text.secondary">
          {p.engagementMois == null ? "Engagement non précisé" : "Engagement : " + compter(p.engagementMois, "mois", "mois")}
          {" · "}{p.preavisMois == null ? "Préavis non précisé" : "Préavis : " + compter(p.preavisMois, "mois", "mois")}
        </Typography>
        <Typography variant="body2" color="text.secondary">{p.envoyeeLe ? "Envoyée le " + date(p.envoyeeLe) : "Pas encore envoyée"}
          {" · "}{p.valideJusquAu ? "Valide jusqu'au " + date(p.valideJusquAu) : "Validité à préciser avant l'envoi"}</Typography>
        {p.documentUrl && <Button component="a" href={p.documentUrl} target="_blank" rel="noopener noreferrer">Ouvrir le document</Button>}
        {p.reponseClient && <Typography sx={{ mt: 1 }}>Réponse du client : {p.reponseClient}</Typography>}
        {p.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Notes : {p.notes}</Typography>}
        {precedente && <Typography variant="body2" sx={{ mt: 2 }}>
          {eurosPrecis(totaux.abonnementMensuelCentimes)} par mois, {difference === 0 ? "autant que la version " : eurosPrecis(Math.abs(difference)) + (difference < 0 ? " de moins que la version " : " de plus que la version ")}{precedente.version}.
        </Typography>}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
          {montantsModifiables && <>
            <Button onClick={() => setDialogue({ action: "modifier", proposition: p })}>{p.statut === "BROUILLON" ? "Modifier" : "Compléter"}</Button>
            {p.statut === "BROUILLON" && <Button onClick={() => setDialogue({ action: "envoyer", proposition: p })}>Envoyer</Button>}
            {p.statut === "ENVOYEE" && enAttente?.id === p.id && <Button disabled={envoi} onClick={() => void agir(async () => {
              await envoyer("/api/pilot/propositions/" + p.id, "PATCH", modificationProposition, { operation: "statut", vers: "EN_DISCUSSION" });
              termine("Version " + p.version + " en discussion.");
            })}>En discussion</Button>}
            {enAttente?.id === p.id && <>
              <Button onClick={() => setDialogue({ action: "accepter", proposition: p })}>Accepter</Button>
              <Button onClick={() => setDialogue({ action: "refuser", proposition: p })}>Refuser</Button>
            </>}
          </>}
          {p.contratId && <Button component={Link} href={"/pilot/organisations/" + organisationId + "?onglet=argent#contrat-" + p.contratId}>Voir le contrat</Button>}
        </Stack>
      </CardContent></Card>;
    })}
    <OpportunitesOuvertes organisationId={organisationId} etape={etape} opportunites={opportunites} catalogue={catalogue} modifiables={montantsModifiables} />
    {(etape === "PROPOSITION" || jalons.length > 0) && <PlanSignature organisationId={organisationId} jalons={jalons} modifiable={montantsModifiables} />}
    {dialogue?.action === "modifier" && <DialogueProposition proposition={dialogue.proposition} remarques={dialogue.remarques} grillePreremplie={dialogue.grillePreremplie}
      catalogue={catalogue} centres={centres} grilleDu={grilleDu}
      fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue && dialogue.action !== "modifier" && <DialogueFormulaire
      titre={{ envoyer: "Envoyer la proposition", accepter: "Accepter la proposition", refuser: "Refuser la proposition" }[dialogue.action]}
      bouton={{ envoyer: "Envoyer", accepter: "Accepter et créer le contrat", refuser: "Refuser" }[dialogue.action]}
      fermer={() => setDialogue(null)} soumettre={async (f) => {
        const url = "/api/pilot/propositions/" + dialogue.proposition.id;
        if (dialogue.action === "accepter") {
          const resultat = await envoyer<{ etapeChangee: boolean; brouillonRepris: boolean; rattachementsCrees: number; sansCentre: string | null }>(url + "/accepter", "POST", acceptationProposition, { debuteLe: String(f.get("debuteLe") ?? "") || null, remplaceContratIds: f.getAll("remplaceContratIds").map(Number) });
          const fait = resultat.brouillonRepris ? "Contrat en brouillon complété et activé." : "Contrat créé.";
          termine(fait + (resultat.etapeChangee ? " Le client est en Signé." : client ? " L'étape ne change pas." : " L'étape reste " + LIBELLES[etape] + ".")
            + phraseRattachements(resultat.rattachementsCrees, resultat.sansCentre));
        } else {
          await envoyer(url, "PATCH", modificationProposition, { operation: "statut", vers: dialogue.action === "envoyer" ? "ENVOYEE" : "REFUSEE",
            ...(dialogue.action === "envoyer" ? { valideJusquAu: f.get("valideJusquAu"), documentUrl: String(f.get("documentUrl") ?? "").trim() || null } : { reponseClient: f.get("reponseClient") }) });
          termine(dialogue.action === "envoyer" ? "Proposition envoyée." : "Proposition refusée.");
        }
      }}>
      {dialogue.action === "envoyer" ? <>
        <TextField name="valideJusquAu" label="Valide jusqu'au" type="date" required autoFocus defaultValue={dansJours(new Date(), 30).toISOString().slice(0, 10)}
          inputProps={{ min: new Date().toISOString().slice(0, 10) }} InputLabelProps={{ shrink: true }} />
        <TextField name="documentUrl" label="Lien du document, facultatif" type="url" defaultValue={dialogue.proposition.documentUrl ?? ""} helperText="Lien https uniquement." />
      </> : dialogue.action === "refuser" ? <TextField name="reponseClient" label="Réponse du client, facultative" multiline minRows={2} autoFocus defaultValue={dialogue.proposition.reponseClient ?? ""} inputProps={{ maxLength: 5000 }} /> : <>
        <Typography>{brouillonVide ? "Le contrat en brouillon, encore sans ligne, recevra ces lignes et deviendra actif." : "Le contrat sera créé avec ces lignes."} {chemin ? "Le client passera en Signé." + (chemin.length > 1 ? " Les étapes intermédiaires seront franchies aujourd'hui, une à une." : "")
          : client ? "Le client est déjà signé : son étape ne change pas." : "Le client est en " + LIBELLES[etape] + " : son étape ne change pas."}</Typography>
        {chemin && <Typography variant="body2" color="text.secondary">{RIEN_NE_CHANGE}</Typography>}
        <Typography variant="body2" color="text.secondary">Les autres versions en cours seront refusées et les opportunités ouvertes des produits concernés seront gagnées.</Typography>
        {brouillonAvecLignes && <Typography variant="body2" color="warning.main">{BROUILLON_EXISTANT}</Typography>}
        <TextField name="debuteLe" label="Date de début, facultative" type="date" autoFocus InputLabelProps={{ shrink: true }} />
        {contratsActifs.map((c) => <FormControlLabel key={c.id} control={<Checkbox name="remplaceContratIds" value={c.id} defaultChecked={false} />}
          label={"Terminer " + (c.reference ?? "le contrat sans référence") + " à la signature"} />)}
        {!!contratsActifs.length && <Typography variant="body2" color="text.secondary">Sans ces cases, le nouveau contrat s&apos;ajoute aux contrats actifs. Les contrats cochés se terminent à la date de début saisie, ou aujourd&apos;hui si elle est vide.</Typography>}
      </>}
    </DialogueFormulaire>}
  </Stack>;
}

/** Les opportunités ouvertes, en lecture : ce qu'on estime avant la proposition. Elles se modifient dans l'onglet Argent. */
function OpportunitesOuvertes({ organisationId, etape, opportunites, catalogue, modifiables }: {
  organisationId: number; etape: CrmEtapeCommerciale; opportunites: OpportuniteFiche[]; catalogue: { id: number; name: string }[]; modifiables: boolean;
}) {
  const ouvertes = opportunites.filter((o) => !o.gagneeLe && !o.perdueLe);
  const total = ouvertes.reduce((t, o) => t + o.montantMensuelCentimes, 0);
  const lien = "/pilot/organisations/" + organisationId + "?onglet=argent";
  return <Box>
    <Typography variant="h2" gutterBottom>Opportunités ouvertes</Typography>
    {!ouvertes.length ? <Typography color="text.secondary">
      Aucune opportunité ouverte. {modifiables ? "Ajoutez une estimation dans l'onglet Argent." : "Un compte qui modifie les montants peut ajouter une estimation dans l'onglet Argent."}
    </Typography> : <Card><CardContent>
      <Stack spacing={1}>
        {ouvertes.map((o) => <Stack key={o.id} direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ overflowWrap: "anywhere" }}>{catalogue.find((p) => p.id === o.productId)?.name ?? "Produit non disponible"}{o.libelle ? " · " + o.libelle : ""}</Typography>
            <Typography variant="body2" color="text.secondary">Probabilité : {probabiliteEffective(o, etape)} %</Typography>
          </Box>
          <Typography fontWeight={500} sx={{ flexShrink: 0 }}>{eurosPrecis(o.montantMensuelCentimes)} par mois</Typography>
        </Stack>)}
        {ouvertes.length > 1 && <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
          <Typography variant="body2" color="text.secondary">Total estimé</Typography>
          <Typography variant="body2" fontWeight={500}>{eurosPrecis(total)} par mois</Typography>
        </Stack>}
      </Stack>
    </CardContent></Card>}
    <Button component={Link} href={lien} sx={{ mt: 1 }}>{modifiables ? "Modifier dans l'onglet Argent" : "Voir dans l'onglet Argent"}</Button>
  </Box>;
}

"use client";

import { MenuItem, TextField, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { entierDepuisSaisie, saisieEuros } from "@/pilot/lib/argent";
import { LIBELLES_TYPE_CONCURRENT } from "@/pilot/lib/concurrents/regles";
import type { ConcurrentEcran, ReleveEcran } from "./types";

/**
 * Les dialogues des concurrents et de leurs relevés (lot R). Aucune validation
 * côté écran : le serveur répond par un message écrit pour l'utilisateur, affiché
 * tel quel (nom déjà pris, relevé daté du futur, version périmée…).
 */

/** Créer ou modifier un concurrent. `concurrent` absent : création. */
export function DialogueConcurrent({ concurrent, fermer, termine }: { concurrent?: ConcurrentEcran; fermer: () => void; termine: (message: string) => void }) {
  return <DialogueFormulaire titre={concurrent ? "Modifier le concurrent" : "Nouveau concurrent"} bouton={concurrent ? "Enregistrer" : "Créer"} fermer={fermer} soumettre={async (f) => {
    const valeurs = { nom: texte(f, "nom"), type: texte(f, "type"), offre: texte(f, "offre"), siteWeb: texte(f, "siteWeb"), notes: texte(f, "notes") };
    if (concurrent) await envoyer(`/api/pilot/concurrents/${concurrent.id}`, "PATCH", undefined, { ...valeurs, majLe: concurrent.majLe });
    else await envoyer("/api/pilot/concurrents", "POST", undefined, valeurs);
    termine(concurrent ? "Concurrent modifié." : "Concurrent créé.");
  }}>
    <TextField name="nom" label="Nom" defaultValue={concurrent?.nom ?? ""} required autoFocus fullWidth inputProps={{ maxLength: 120 }}
      helperText="Le nom sous lequel l'équipe le connaît. Deux concurrents ne portent pas le même nom." />
    <TextField name="type" label="Type" select defaultValue={concurrent?.type ?? "AUTRE"} required fullWidth>
      {Object.entries(LIBELLES_TYPE_CONCURRENT).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
    </TextField>
    <TextField name="offre" label="Son offre" defaultValue={concurrent?.offre ?? ""} multiline minRows={3} fullWidth inputProps={{ maxLength: 2000 }}
      helperText="Ce qu'il propose, en quelques phrases." />
    <TextField name="siteWeb" label="Site web" defaultValue={concurrent?.siteWeb ?? ""} fullWidth inputProps={{ maxLength: 300 }} placeholder="www.exemple.fr" />
    <TextField name="notes" label="Notes" defaultValue={concurrent?.notes ?? ""} multiline minRows={3} fullWidth inputProps={{ maxLength: 2000 }}
      helperText="Forces, faiblesses, ce que disent les clients." />
  </DialogueFormulaire>;
}

/** Un prix saisi en euros, vide quand il n'est pas connu : l'écran dit alors « prix non relevé », jamais 0 €. */
function prix(f: FormData, cle: string, libelle: string): number | null {
  const saisie = texte(f, cle).trim();
  return saisie === "" ? null : entierDepuisSaisie(saisie, 2, libelle);
}

/** Ajouter ou corriger un relevé de prix. `releve` absent : ajout. */
export function DialogueReleve({ concurrentId, releve, fermer, termine }: {
  concurrentId: number; releve?: ReleveEcran; fermer: () => void; termine: (message: string) => void;
}) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return <DialogueFormulaire titre={releve ? "Modifier le relevé" : "Ajouter un relevé de prix"} bouton={releve ? "Enregistrer" : "Ajouter"} fermer={fermer} soumettre={async (f) => {
    const valeurs = {
      releveLe: texte(f, "releveLe"),
      prixSalleMoisCentimes: prix(f, "prixSalle", "Prix par salle et par mois en euros"),
      prixInstallationCentimes: prix(f, "prixInstallation", "Prix d'installation en euros"),
      conditions: texte(f, "conditions"), source: texte(f, "source"),
    };
    if (!releve) {
      await envoyer(`/api/pilot/concurrents/${concurrentId}/releves`, "POST", undefined, valeurs);
      termine("Relevé ajouté.");
      return;
    }
    // En correction, seuls les champs modifiés partent, avec la version lue : si quelqu'un a corrigé
    // le relevé entre-temps, le serveur répond 409. Renvoyer le même jour ramènerait aussi l'heure à minuit.
    const lus = { releveLe: releve.releveLe.slice(0, 10), prixSalleMoisCentimes: releve.prixSalleMoisCentimes,
      prixInstallationCentimes: releve.prixInstallationCentimes, conditions: releve.conditions ?? "", source: releve.source ?? "" };
    const modifies = Object.fromEntries(Object.entries(valeurs).filter(([cle, valeur]) => valeur !== lus[cle as keyof typeof lus]));
    if (!Object.keys(modifies).length) { fermer(); return; }
    await envoyer(`/api/pilot/concurrents/${concurrentId}/releves/${releve.id}`, "PATCH", undefined, { ...modifies, majLe: releve.majLe });
    termine("Relevé modifié.");
  }}>
    <TextField name="releveLe" label="Date du relevé" type="date" required autoFocus defaultValue={releve?.releveLe.slice(0, 10) ?? aujourdhui}
      InputLabelProps={{ shrink: true }} inputProps={{ max: aujourdhui }} helperText="Le jour où vous avez vu ce prix. Le relevé le plus récent est celui en vigueur." />
    <TextField name="prixSalle" label="Prix par salle et par mois, en euros" defaultValue={releve?.prixSalleMoisCentimes != null ? saisieEuros(releve.prixSalleMoisCentimes) : ""}
      fullWidth inputProps={CHAMP_DECIMAL} helperText="Laissez vide si le prix n'est pas connu : l'écran dira « prix non relevé », jamais 0 €." />
    <TextField name="prixInstallation" label="Prix d'installation, en euros" defaultValue={releve?.prixInstallationCentimes != null ? saisieEuros(releve.prixInstallationCentimes) : ""}
      fullWidth inputProps={CHAMP_DECIMAL} helperText="Facultatif. Laissez vide s'il n'est pas connu." />
    <TextField name="conditions" label="Conditions" defaultValue={releve?.conditions ?? ""} multiline minRows={2} fullWidth inputProps={{ maxLength: 2000 }}
      helperText="Durée d'engagement, remises, ce qui est inclus." />
    <TextField name="source" label="Source" defaultValue={releve?.source ?? ""} multiline minRows={2} fullWidth inputProps={{ maxLength: 2000 }}
      helperText="D'où vient ce prix : devis du client, site du concurrent, échange avec un centre." />
  </DialogueFormulaire>;
}

/** Supprimer un relevé. */
export function DialogueSuppressionReleve({ concurrentId, releve, fermer, termine }: {
  concurrentId: number; releve: ReleveEcran; fermer: () => void; termine: (message: string) => void;
}) {
  return <DialogueFormulaire titre="Supprimer ce relevé ?" bouton="Supprimer" suppression fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/concurrents/${concurrentId}/releves/${releve.id}`, "DELETE", undefined, { majLe: releve.majLe });
    termine("Relevé supprimé.");
  }}>
    <Typography>{releve.enVigueur ? "C'est le relevé en vigueur : le précédent le deviendra. " : ""}Cette action est définitive.</Typography>
  </DialogueFormulaire>;
}

/** Supprimer un concurrent : le serveur refuse tant qu'une organisation le désigne, et dit lesquelles à retirer. */
export function DialogueSuppressionConcurrent({ concurrent, fermer, termine }: { concurrent: ConcurrentEcran; fermer: () => void; termine: (message: string) => void }) {
  return <DialogueFormulaire titre={`Supprimer ${concurrent.nom} ?`} bouton="Supprimer" suppression fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/concurrents/${concurrent.id}`, "DELETE");
    termine("Concurrent supprimé.");
  }}>
    <Typography>Ses relevés de prix sont supprimés avec lui. Cette action est définitive.</Typography>
    <Typography color="text.secondary">Impossible tant qu&apos;un établissement le désigne comme concurrent en place ou comme gagnant d&apos;une affaire. Retirez d&apos;abord ces liens depuis les fiches.</Typography>
  </DialogueFormulaire>;
}

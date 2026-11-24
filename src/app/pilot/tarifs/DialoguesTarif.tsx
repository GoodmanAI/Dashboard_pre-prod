"use client";

import { useState } from "react";
import { MenuItem, TextField, Typography } from "@mui/material";
import type { CrmBaseTarif, CrmTypeLigne } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { nombreFacultatif, texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { entierDepuisSaisie, saisieEuros } from "@/pilot/lib/argent";
import { LIBELLES_LIGNE } from "@/pilot/lib/propositions/regles";
import { LIBELLES_BASE_CHOIX, jourFr, phraseSuppressionGrille, saisieTaux, tauxDepuisSaisie } from "@/pilot/lib/tarifs/affichage";
import { PRODUIT_NON_RELIE, ROLES, roleDuCode, rolesDisponibles, type RoleTarif } from "@/pilot/lib/tarifs/roles";
import type { GrilleEcran, TarifEcran } from "./types";

/**
 * Les dialogues de la page Tarifs (lot S). Les montants se saisissent en euros
 * hors taxe et passent par `entierDepuisSaisie` : des centimes entiers, jamais
 * un flottant. Le serveur répond par un message écrit pour l'utilisateur
 * (grille utilisée, version périmée, date prise…), affiché tel quel.
 */

const STATUT_COURT = { EN_VIGUEUR: "en vigueur", PROCHAINE: "à venir", PASSEE: "ancienne" } as const;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Le premier jour du mois suivant, « AAAA-MM-JJ » : le moment naturel d'une nouvelle grille. */
function debutDuMoisSuivant(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/** Un prix en euros, vide quand il n'est pas connu : l'écran dit alors « Prix à renseigner », jamais 0 €. */
function prix(f: FormData, cle: string): number | null {
  const saisie = texte(f, cle).trim();
  return saisie === "" ? null : entierDepuisSaisie(saisie, 2, "Prix hors taxe en euros");
}

/** Créer une grille datée, vide ou copiée d'une grille existante. */
export function DialogueGrille({ grilles, copierDe, fermer, termine }: {
  grilles: GrilleEcran[]; copierDe: number | null; fermer: () => void; termine: (message: string) => void;
}) {
  return <DialogueFormulaire titre="Nouvelle grille datée" bouton="Créer la grille" fermer={fermer} soumettre={async (f) => {
    const source = nombreFacultatif(f, "copierDe");
    await envoyer("/api/pilot/tarifs", "POST", undefined, { applicableLe: texte(f, "applicableLe"), notes: texte(f, "notes"), ...(source === null ? {} : { copierDe: source }) });
    termine("Grille créée.");
  }}>
    <Typography variant="body2" color="text.secondary">
      Pour changer un prix, créez une nouvelle grille à la date voulue. Les propositions déjà faites gardent la grille dont elles viennent.
    </Typography>
    <TextField name="applicableLe" label="Date d'application" type="date" required autoFocus defaultValue={debutDuMoisSuivant()}
      InputLabelProps={{ shrink: true }} inputProps={{ min: aujourdhui() }}
      helperText="Aujourd'hui ou un jour à venir. Une grille datée d'aujourd'hui s'applique tout de suite : elle reprend alors les tarifs d'une grille." />
    <TextField name="copierDe" label="Reprendre les tarifs de" select defaultValue={copierDe ?? ""} fullWidth SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
      helperText="Les tarifs sont copiés, puis modifiables tant qu'aucune proposition n'utilise la nouvelle grille.">
      <MenuItem value="">Aucune, grille vide</MenuItem>
      {grilles.map((g) => <MenuItem key={g.id} value={g.id}>Grille du {jourFr(g.applicableLe)} ({STATUT_COURT[g.statut]})</MenuItem>)}
    </TextField>
    <TextField name="notes" label="Notes, facultatif" multiline minRows={2} fullWidth inputProps={{ maxLength: 2000 }}
      helperText="Pourquoi cette grille : hausse annuelle, nouvelle offre." />
  </DialogueFormulaire>;
}

/** La date (grille à venir) et les notes d'une grille que rien n'utilise. */
export function DialogueModifierGrille({ grille, fermer, termine }: { grille: GrilleEcran; fermer: () => void; termine: (message: string) => void }) {
  return <DialogueFormulaire titre={`Modifier la grille du ${jourFr(grille.applicableLe)}`} fermer={fermer} soumettre={async (f) => {
    const notes = texte(f, "notes").trim();
    const modifies = {
      ...(grille.dateModifiable && texte(f, "applicableLe") !== grille.applicableLe ? { applicableLe: texte(f, "applicableLe") } : {}),
      ...(notes !== (grille.notes ?? "") ? { notes } : {}),
    };
    if (!Object.keys(modifies).length) { fermer(); return; }
    await envoyer(`/api/pilot/tarifs/${grille.id}`, "PATCH", undefined, { majLe: grille.majLe, ...modifies });
    termine("Grille modifiée.");
  }}>
    {grille.dateModifiable
      ? <TextField name="applicableLe" label="Date d'application" type="date" required autoFocus defaultValue={grille.applicableLe}
        InputLabelProps={{ shrink: true }} inputProps={{ min: aujourdhui() }} helperText="Aujourd'hui ou un jour à venir." />
      : <Typography variant="body2" color="text.secondary">La date d&apos;une grille en vigueur ne change plus. Créez une nouvelle grille datée pour changer un prix.</Typography>}
    <TextField name="notes" label="Notes" multiline minRows={2} fullWidth defaultValue={grille.notes ?? ""} autoFocus={!grille.dateModifiable} inputProps={{ maxLength: 2000 }} />
  </DialogueFormulaire>;
}

/**
 * Ajouter un tarif ou corriger un tarif. À l'ajout, on choisit d'abord son rôle
 * (Abonnement Talk, Connecteur RIS, Autre prestation…) : le rôle fixe le code
 * que lisent le préremplissage et l'apport, et limite le type et la base
 * permis. Un rôle déjà présent dans la grille ne se propose plus. Un rôle de
 * produit ne propose que son produit, ou aucun. Le serveur garde les mêmes règles. En correction, le rôle ne change pas, et seuls les
 * champs modifiés partent, avec la version de la grille lue.
 */
export function DialogueTarif({ grille, tarif, catalogue, fermer, termine }: {
  grille: GrilleEcran; tarif?: TarifEcran; catalogue: { id: number; name: string }[]; fermer: () => void; termine: (message: string) => void;
}) {
  const disponibles = rolesDisponibles(grille.tarifs.map((t) => t.code));
  const [role, setRole] = useState<RoleTarif>(tarif ? roleDuCode(tarif.code) : disponibles[0]);
  const def = ROLES[role];
  const [base, setBase] = useState<CrmBaseTarif>(tarif?.base ?? def.bases[0]);
  const choisirRole = (r: RoleTarif) => { setRole(r); setBase(ROLES[r].bases[0]); };
  const produitAttendu = def.produit ? catalogue.find((p) => p.name === def.produit) ?? null : null;
  // Un rôle de produit : son produit, ou aucun (le serveur refuse les autres). Un produit ancien, relié avant la règle, reste visible pour qu'on le corrige.
  const actuel = tarif?.productId != null ? catalogue.find((p) => p.id === tarif.productId) ?? null : null;
  const produitsProposes = def.produit === null ? catalogue : [produitAttendu, actuel].filter((p, i, l): p is { id: number; name: string } => p !== null && l.findIndex((q) => q?.id === p.id) === i);
  const renseigner = tarif !== undefined && tarif.base !== "POURCENTAGE" && tarif.montantHtCentimes === null;
  return <DialogueFormulaire titre={!tarif ? "Ajouter un tarif" : renseigner ? "Renseigner le prix" : "Modifier le tarif"} bouton={tarif ? "Enregistrer" : "Ajouter"} fermer={fermer} soumettre={async (f) => {
    const valeurs = {
      libelle: texte(f, "libelle").trim(), productId: nombreFacultatif(f, "productId"),
      // Un seul type permis : il n'y a pas de choix à lire.
      type: (def.types.length === 1 ? def.types[0] : texte(f, "type")) as CrmTypeLigne, base,
      montantHtCentimes: base === "POURCENTAGE" ? null : prix(f, "montant"), pourMille: base === "POURCENTAGE" ? tauxDepuisSaisie(texte(f, "taux")) : null,
    };
    if (!tarif) {
      await envoyer(`/api/pilot/tarifs/${grille.id}/tarifs`, "POST", undefined, { ...valeurs, role, majLe: grille.majLe });
      termine("Tarif ajouté.");
      return;
    }
    const lus: typeof valeurs = { libelle: tarif.libelle, productId: tarif.productId, type: tarif.type, base: tarif.base, montantHtCentimes: tarif.montantHtCentimes, pourMille: tarif.pourMille };
    const modifies = Object.fromEntries(Object.entries(valeurs).filter(([cle, valeur]) => valeur !== lus[cle as keyof typeof lus]));
    if (!Object.keys(modifies).length) { fermer(); return; }
    await envoyer(`/api/pilot/tarifs/${grille.id}/tarifs/${tarif.id}`, "PATCH", undefined, { ...modifies, majLe: grille.majLe });
    termine(renseigner ? "Prix renseigné." : "Tarif modifié.");
  }}>
    {tarif
      ? <Typography variant="body2" color="text.secondary" data-role={role}>
        Rôle : {def.libelle}. Le rôle ne change pas : pour en changer, retirez ce tarif et ajoutez-en un autre.
      </Typography>
      : <TextField label="Rôle" select required fullWidth autoFocus value={role} onChange={(e) => choisirRole(e.target.value as RoleTarif)}
        helperText={role === "FORMATION_POC" ? "Une seule formation par dossier, due au début du premier POC. Ce prix est conservé sur le dossier, hors contrat." : role === "AUTRE" ? "Une prestation à part : vente de RIS, formation. Elle ne se préremplit pas." : "Ce que ce tarif représente pour le préremplissage des propositions et l'apport d'affaires."}>
        {disponibles.map((r) => <MenuItem key={r} value={r}>{ROLES[r].libelle}</MenuItem>)}
      </TextField>}
    <TextField key={`libelle-${role}`} name="libelle" label="Libellé" required autoFocus={!!tarif && !renseigner} fullWidth defaultValue={tarif?.libelle ?? def.libelleParDefaut} inputProps={{ maxLength: 120 }}
      helperText="Le nom affiché dans les propositions." />
    {def.types.length > 1 && <TextField key={`type-${role}`} name="type" label="Type" select required fullWidth defaultValue={tarif?.type ?? def.types[0]}
      helperText="Un abonnement se facture chaque mois. Les frais d'installation et les prestations se facturent une fois.">
      {def.types.map((v) => <MenuItem key={v} value={v}>{LIBELLES_LIGNE[v]}</MenuItem>)}
    </TextField>}
    {def.bases.length > 1
      ? <TextField label="Base" select required fullWidth value={base} onChange={(e) => setBase(e.target.value as CrmBaseTarif)}
        helperText="Ce sur quoi le prix s'applique : chaque salle, chaque site ou toute l'organisation.">
        {def.bases.map((v) => <MenuItem key={v} value={v}>{LIBELLES_BASE_CHOIX[v]}</MenuItem>)}
      </TextField>
      : <Typography variant="body2" color="text.secondary">Base : {LIBELLES_BASE_CHOIX[def.bases[0]].toLowerCase()}, chaque mois.</Typography>}
    {base === "POURCENTAGE"
      ? <TextField name="taux" label="Taux, en % du montant des salles" required fullWidth defaultValue={tarif?.pourMille != null ? saisieTaux(tarif.pourMille) : ""}
        inputProps={CHAMP_DECIMAL} helperText="De 0 à 100 %, une décimale au plus." />
      : <TextField name="montant" label="Prix hors taxe, en euros" fullWidth autoFocus={renseigner} defaultValue={tarif?.montantHtCentimes != null ? saisieEuros(tarif.montantHtCentimes) : ""}
        inputProps={CHAMP_DECIMAL} helperText="Laissez vide si le prix n'est pas connu : l'écran dira « Prix à renseigner », jamais 0 €." />}
    <TextField key={`produit-${role}`} name="productId" label={def.produit ? "Produit" : "Produit, facultatif"} select fullWidth
      defaultValue={tarif ? tarif.productId ?? "" : produitAttendu?.id ?? ""} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
      helperText={def.produit
        ? produitAttendu ? `Le produit de ce rôle est ${def.produit} : ses lignes préremplies entrent au catalogue.` : `${def.produit} n'est pas au catalogue. ${PRODUIT_NON_RELIE}`
        : "Laissez « Hors catalogue » pour une prestation qui n'est pas un produit."}>
      <MenuItem value="">Hors catalogue</MenuItem>
      {produitsProposes.map((p) => <MenuItem key={p.id} value={p.id} disabled={def.produit !== null && p.name !== def.produit}>{p.name}</MenuItem>)}
    </TextField>
  </DialogueFormulaire>;
}

export function DialogueSuppressionTarif({ grille, tarif, fermer, termine }: { grille: GrilleEcran; tarif: TarifEcran; fermer: () => void; termine: (message: string) => void }) {
  return <DialogueFormulaire titre="Retirer ce tarif ?" bouton="Retirer" suppression fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/tarifs/${grille.id}/tarifs/${tarif.id}`, "DELETE", undefined, { majLe: grille.majLe });
    termine("Tarif retiré.");
  }}>
    <Typography>« {tarif.libelle} » sera retiré de la grille du {jourFr(grille.applicableLe)}. Les propositions préremplies ne le proposeront plus.</Typography>
  </DialogueFormulaire>;
}

/** Supprimer une grille à venir que rien n'utilise, avec ses tarifs. Le serveur refuse une grille utilisée, en vigueur ou passée. */
export function DialogueSuppressionGrille({ grille, fermer, termine }: { grille: GrilleEcran; fermer: () => void; termine: (message: string) => void }) {
  return <DialogueFormulaire titre="Supprimer cette grille ?" bouton="Supprimer" suppression fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/tarifs/${grille.id}`, "DELETE", undefined, { majLe: grille.majLe });
    termine("Grille supprimée.");
  }}>
    <Typography>{phraseSuppressionGrille(grille.applicableLe, grille.tarifs.length)} Aucune proposition ne l&apos;utilise.</Typography>
  </DialogueFormulaire>;
}

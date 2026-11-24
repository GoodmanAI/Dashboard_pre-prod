"use client";
import { useState } from "react";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { Box, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import type { CrmBaseTarif, CrmReconduction, CrmTypeLigne } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { nombreFacultatif, texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { centimesDepuisSaisie, saisieEuros } from "@/pilot/lib/argent";
import { creationContrat, modificationContrat, ligneContrat } from "@/pilot/lib/validation/contrat";
import { LIBELLES_LIGNE, LIBELLES_UNITE, TYPES_LIGNE_SAISIS, montantContratCalcule, pourMilleDepuisSaisie } from "@/pilot/lib/propositions/regles";
import { quantiteDepuisSaisie, saisiePourMille } from "@/pilot/lib/propositions/saisie";
import { BASES_QUANTITE } from "./DialogueProposition";
import { eurosPrecis } from "@/pilot/lib/argent";
import { aideType } from "@/pilot/lib/propositions/affichage";
import { AIDES_RECONDUCTION, LIBELLES_RECONDUCTION, debutApresEssai } from "@/pilot/lib/ventes/regles";
import type { BilanOpportunites } from "@/pilot/lib/opportunites/regles";
import type { LigneContratFiche } from "./ContratsOrganisation";


/** Ce que le dialogue modifie d'un contrat. Les dates sont des chaînes ISO. */
export type ContratEditable = {
  id: number; reference: string | null; engagementMois: number | null; preavisMois: number | null;
  signeLe: string | null; debuteLe: string | null; renouvelleLe: string | null; essaiDebuteLe: string | null;
  essaiJours: number | null; reconduction: CrmReconduction | null; conditionsTarifaires: string | null;
};
type ChampDate = "signeLe" | "debuteLe" | "renouvelleLe" | "essaiDebuteLe";

const SOUS_TITRE = { fontSize: 13, fontWeight: 600, color: "text.secondary", pt: 0.5 };
const DEUX_COLONNES = { display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } };

/**
 * Les conditions d'un contrat dans l'ordre où elles arrivent : signature, essai,
 * début officiel, durée, reconduction, puis ce qui a été négocié en plus des
 * lignes de tarif (CHOIX.md, C-62).
 */
export function DialogueContrat({ organisationId, contrat, fermer, termine }: {
  organisationId: number; contrat?: ContratEditable; fermer: () => void; termine: () => void;
}) {
  const [reconduction, setReconduction] = useState<CrmReconduction | "">(contrat?.reconduction ?? "");
  // Le début officiel suit l'essai tant qu'on ne l'a pas saisi autrement (C-87) : le lendemain de son dernier jour.
  const [essaiDebut, setEssaiDebut] = useState(contrat?.essaiDebuteLe?.slice(0, 10) ?? "");
  const [essaiJours, setEssaiJours] = useState(contrat?.essaiJours?.toString() ?? "");
  const [debut, setDebut] = useState(contrat?.debuteLe?.slice(0, 10) ?? "");
  const propose = debutApresEssai(essaiDebut, essaiJours === "" ? null : Number(essaiJours));
  const [debutSuit, setDebutSuit] = useState(!contrat?.debuteLe || contrat.debuteLe.slice(0, 10) === debutApresEssai(essaiDebut, contrat.essaiJours));
  const changerEssai = (debutEssai: string, jours: string) => {
    setEssaiDebut(debutEssai); setEssaiJours(jours);
    const suivant = debutApresEssai(debutEssai, jours === "" ? null : Number(jours));
    if (debutSuit && suivant) setDebut(suivant);
  };
  const jourFr = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const champDate = (champ: ChampDate, label: string, aide?: string) =>
    <TextField name={champ} label={label} type="date" defaultValue={contrat?.[champ]?.slice(0, 10) ?? ""} InputLabelProps={{ shrink: true }} helperText={aide} />;
  return <DialogueFormulaire titre={contrat ? "Modifier le contrat" : "Nouveau contrat"} fermer={fermer} soumettre={async (f) => {
    const dateSaisie = (champ: ChampDate) => {
      const valeur = texte(f, champ);
      return valeur && valeur === contrat?.[champ]?.slice(0, 10) ? contrat[champ] : valeur || null;
    };
    const champs = { reference: texte(f, "reference"), signeLe: dateSaisie("signeLe"), debuteLe: dateSaisie("debuteLe"),
      renouvelleLe: dateSaisie("renouvelleLe"), engagementMois: nombreFacultatif(f, "engagementMois"), preavisMois: nombreFacultatif(f, "preavisMois"),
      essaiDebuteLe: dateSaisie("essaiDebuteLe"), essaiJours: nombreFacultatif(f, "essaiJours"),
      reconduction: reconduction || null, conditionsTarifaires: texte(f, "conditionsTarifaires") };
    await envoyer(contrat ? "/api/pilot/contrats/" + contrat.id : "/api/pilot/contrats", contrat ? "PATCH" : "POST",
      contrat ? modificationContrat : creationContrat, contrat ? { operation: "modifier", ...champs } : { organisationId, ...champs, lignes: [] });
    termine();
  }}>
    <Box sx={DEUX_COLONNES}>
      <TextField name="reference" label="Référence, facultative" autoFocus defaultValue={contrat?.reference ?? ""} inputProps={{ maxLength: 200 }} />
      {champDate("signeLe", "Signé le")}
    </Box>

    <Typography sx={SOUS_TITRE}>Essai du contrat signé</Typography>
    <Box sx={DEUX_COLONNES}>
      <TextField name="essaiDebuteLe" label="Début de l'essai" type="date" value={essaiDebut} InputLabelProps={{ shrink: true }}
        onChange={(e) => changerEssai(e.target.value, essaiJours)} />
      <TextField name="essaiJours" label="Durée de l'essai en jours" type="number" value={essaiJours} onChange={(e) => changerEssai(essaiDebut, e.target.value)}
        inputProps={{ min: 1, max: 365, step: 1 }} helperText="Vide s'il n'y a pas d'essai." />
    </Box>

    <Typography sx={SOUS_TITRE}>Contrat</Typography>
    <Box sx={DEUX_COLONNES}>
      <TextField name="debuteLe" label="Début officiel du contrat" type="date" value={debut} InputLabelProps={{ shrink: true }}
        onChange={(e) => { setDebut(e.target.value); setDebutSuit(!e.target.value || e.target.value === propose); }}
        helperText={propose && debut === propose ? `Le lendemain de la fin de l'essai. Le chiffre d'affaires compte à partir de cette date.`
          : propose ? <>Après l&apos;essai, ce serait le {jourFr(propose)}. <Box component="button" type="button" onClick={() => { setDebut(propose); setDebutSuit(true); }}
            sx={{ p: 0, border: 0, background: "none", color: "primary.main", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>Reprendre cette date</Box></>
          : "Le chiffre d'affaires compte à partir de cette date."} />
      <TextField name="engagementMois" label="Durée du contrat en mois" type="number" defaultValue={contrat?.engagementMois ?? ""} inputProps={{ min: 0, max: 120, step: 1 }} />
    </Box>

    <Typography sx={SOUS_TITRE}>Reconduction</Typography>
    <TextField label="Reconduction" select value={reconduction} onChange={(e) => setReconduction(e.target.value as CrmReconduction | "")}
      helperText={reconduction ? AIDES_RECONDUCTION[reconduction] : "Ce qui se passe à la fin de la durée du contrat."}>
      <MenuItem value="">Non renseignée</MenuItem>
      {Object.entries(LIBELLES_RECONDUCTION).map(([v, label]) => <MenuItem key={v} value={v}>{label}</MenuItem>)}
    </TextField>
    <Box sx={DEUX_COLONNES}>
      <TextField name="preavisMois" label="Préavis en mois" type="number" defaultValue={contrat?.preavisMois ?? ""} inputProps={{ min: 0, max: 120, step: 1 }} />
      {champDate("renouvelleLe", "Date de renouvellement", "Seulement si elle diffère de la fin de la durée.")}
    </Box>

    <Typography sx={SOUS_TITRE}>Conditions tarifaires</Typography>
    <TextField name="conditionsTarifaires" label="Conditions particulières" multiline minRows={2} defaultValue={contrat?.conditionsTarifaires ?? ""}
      inputProps={{ maxLength: 2000 }} helperText="Remise, gratuité, prix garanti. Les montants restent dans les lignes de tarif." />
  </DialogueFormulaire>;
}
export function DialogueLigneContrat({ contratId, ligne, catalogue, centres, fermer, termine }: {
  contratId: number; ligne?: LigneContratFiche; catalogue: { id: number; name: string }[]; centres: { id: number; nom: string }[];
  fermer: () => void;
  /** `bilan` : sur un contrat actif, les opportunités que la ligne vient de gagner (C-71), sinon null. */
  termine: (bilan: BilanOpportunites | null) => void;
}) {
  const [type, setType] = useState<CrmTypeLigne>(ligne?.type ?? "ABONNEMENT");
  // Modifier une ligne sans produit garde « Hors catalogue » : le premier produit n'est présélectionné que pour une ligne neuve.
  const [productId, setProductId] = useState<number | "">(ligne ? ligne.productId ?? "" : catalogue[0]?.id ?? "");
  const [offerte, setOfferte] = useState(!!ligne?.offerte);
  // Le calcul (C-90) : quantité × prix unitaire − remise de la ligne = montant net du contrat.
  const [quantite, setQuantite] = useState(ligne?.quantite?.toString() ?? "");
  const [prix, setPrix] = useState(ligne?.prixUnitaireCentimes != null ? saisieEuros(ligne.prixUnitaireCentimes) : "");
  const [base, setBase] = useState<CrmBaseTarif | "">(ligne?.baseQuantite ?? "");
  const [remise, setRemise] = useState(ligne?.remisePourMille != null ? saisiePourMille(ligne.remisePourMille) : "");
  const horsCatalogue = productId === "";
  const auCalcul = type !== "PART_VARIABLE" && (quantite.trim() !== "" || prix.trim() !== "");
  const lire = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const q = lire(() => quantiteDepuisSaisie(quantite)), pu = lire(() => centimesDepuisSaisie(prix));
  const r = remise.trim() === "" ? 0 : lire(() => pourMilleDepuisSaisie(remise));
  const calcule = auCalcul && q !== null && pu !== null && r !== null ? montantContratCalcule({ quantite: q, prixUnitaireCentimes: pu, remisePourMille: r, offerte }) : null;
  return <DialogueFormulaire titre={ligne ? "Modifier la ligne" : "Ajouter une ligne"} fermer={fermer} soumettre={async (f) => {
    const { bilan = null } = await envoyer<{ bilan?: BilanOpportunites | null }>("/api/pilot/contrats/" + contratId + "/lignes" + (ligne ? "/" + ligne.id : ""), ligne ? "PATCH" : "POST", ligneContrat, {
      productId: productId === "" ? null : productId, centreId: nombreFacultatif(f, "centreId"), type,
      // Une ligne offerte d'un contrat vaut 0 : le contrat est au net (C-39).
      montantCentimes: offerte ? 0 : auCalcul ? (calcule ?? (() => { throw new Error("Vérifiez la quantité, le prix unitaire et la remise."); })()) : centimesDepuisSaisie(texte(f, "montant")),
      libelle: texte(f, "libelle"), offerte,
      quantite: auCalcul ? quantiteDepuisSaisie(quantite) : null, prixUnitaireCentimes: auCalcul ? centimesDepuisSaisie(prix) : null,
      baseQuantite: auCalcul && base !== "" ? base : null, remisePourMille: remise.trim() === "" ? null : pourMilleDepuisSaisie(remise),
      unite: type === "PART_VARIABLE" ? texte(f, "unite") : null, volumeInclus: type === "PART_VARIABLE" ? nombreFacultatif(f, "volumeInclus") : null,
    });
    termine(bilan);
  }}>
    <TextField label="Produit" select autoFocus fullWidth value={productId} onChange={(e) => setProductId(e.target.value === "" ? "" : Number(e.target.value))}
      SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
      helperText={horsCatalogue ? "Hors catalogue : une prestation ou une ligne qui n'est pas un produit. Le libellé est obligatoire." : undefined}>
      <MenuItem value="">Hors catalogue</MenuItem>
      {catalogue.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
    </TextField>
    <TextField name="centreId" label="Centre" select defaultValue={ligne?.centreId ?? ""} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
      <MenuItem value="">Toute l&apos;organisation</MenuItem>{centres.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
    </TextField>
    <TextField label="Type" select value={type} onChange={(e) => setType(e.target.value as CrmTypeLigne)} helperText={aideType(type)}>
      {TYPES_LIGNE_SAISIS.map((v) => <MenuItem key={v} value={v}>{LIBELLES_LIGNE[v]}</MenuItem>)}
    </TextField>
    {type !== "PART_VARIABLE" && <Box sx={DEUX_COLONNES}>
      <TextField label="Quantité" value={quantite} onChange={(e) => setQuantite(e.target.value)} inputProps={{ inputMode: "numeric", maxLength: 6 }}
        helperText="Le nombre de salles, de sites… Vide pour un montant global." />
      <TextField label="Compté" select value={base} onChange={(e) => setBase(e.target.value as CrmBaseTarif | "")} disabled={!auCalcul} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">À l&apos;unité</MenuItem>
        {Object.entries(BASES_QUANTITE).map(([v, libelle]) => <MenuItem key={v} value={v}>{libelle}</MenuItem>)}
      </TextField>
      <TextField label="Prix unitaire HT en euros" value={prix} onChange={(e) => setPrix(e.target.value)} required={auCalcul} inputProps={CHAMP_DECIMAL} />
      <TextField label="Remise en %, facultative" value={remise} onChange={(e) => setRemise(e.target.value)} inputProps={CHAMP_DECIMAL} error={r === null}
        helperText={r === null ? "De 0 à 100 %, une décimale au plus." : undefined} />
    </Box>}
    {auCalcul
      ? <Typography variant="body2" color={calcule === null ? "warning.main" : "text.secondary"} data-calcul-ligne>
        {calcule === null ? "Complétez la quantité et le prix unitaire pour calculer le montant."
          : offerte ? "Offert : la ligne vaut 0,00 € au contrat."
          : `${q} × ${eurosPrecis(pu!)}${r ? ` − ${saisiePourMille(r!)} %` : ""} = ${eurosPrecis(calcule)} HT net.`}
      </Typography>
      : <TextField name="montant" label={type === "PART_VARIABLE" ? "Prix unitaire HT en euros" : "Montant HT en euros, net"} required={!offerte} disabled={offerte} key={offerte ? "offerte" : "prix"} defaultValue={saisieEuros(offerte ? 0 : ligne?.montantCentimes ?? 0)} inputProps={CHAMP_DECIMAL}
        helperText={offerte ? "Une ligne offerte d'un contrat vaut 0 €. Le prix offert reste sur la proposition." : "Deux décimales au plus. Ou indiquez une quantité et un prix unitaire."} />}
    <Box>
      <FormControlLabel label="Offert" control={<Checkbox checked={offerte} onChange={(e) => setOfferte(e.target.checked)} />} />
      <Typography variant="caption" color="text.secondary" component="div">Geste commercial : la ligne reste au contrat, à 0 €, et se lit « Offert ».</Typography>
    </Box>
    {type === "PART_VARIABLE" && <>
      <TextField name="unite" label="Unité" select required defaultValue={ligne?.unite ?? "APPEL_TRAITE"}>
        {Object.entries(LIBELLES_UNITE).map(([v, label]) => <MenuItem key={v} value={v}>{label}</MenuItem>)}
      </TextField>
      <TextField name="volumeInclus" label="Volume inclus" type="number" defaultValue={ligne?.volumeInclus ?? ""} inputProps={{ min: 0, max: 2147483647, step: 1 }} />
    </>}
    <TextField name="libelle" label={horsCatalogue ? "Libellé" : "Libellé, facultatif"} required={horsCatalogue} defaultValue={ligne?.libelle ?? ""} inputProps={{ maxLength: 500 }} />
  </DialogueFormulaire>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { CrmBaseTarif, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { nombreFacultatif, texte } from "@/pilot/components/formulaires/ChampsOrganisation";
import { centimesDepuisSaisie, pourMilleDepuisSaisie, montantNetLigne, totauxProposition, LIBELLES_LIGNE, LIBELLES_UNITE, TYPES_LIGNE_SAISIS } from "@/pilot/lib/propositions/regles";
import { aideType, estAChiffrer, phraseAChiffrer } from "@/pilot/lib/propositions/affichage";
import { conseilLigne, ligneCalculee, ligneCatalogue, ligneDepuisSaisie, ligneHorsGrille, montantCalcule, refusLigne, saisieDepuisLigne, type LigneSaisie } from "@/pilot/lib/propositions/saisie";
import { modificationProposition } from "@/pilot/lib/validation/proposition";
import { eurosPrecis, saisieEuros } from "@/pilot/lib/argent";
import { jourFr } from "@/pilot/lib/tarifs/affichage";
import type { PropositionFiche } from "./NegociationOrganisation";
import { ZoneRecapitulatif } from "./MontantsProposition";

export const saisieRemise = (n: number) => Math.trunc(n / 10) + (n % 10 ? "," + n % 10 : "");

const DEUX_COLONNES = { display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } };

/** Ce qu'une quantité compte (C-90). */
export const BASES_QUANTITE: Partial<Record<CrmBaseTarif, string>> = { PAR_SALLE: "Par salle", PAR_SITE: "Par site", PAR_ORGANISATION: "Pour l'organisation" };

/** La ligne se calcule-t-elle par quantité × prix ? Jamais pour une part à l'usage, qui a déjà son prix unitaire. */
const calculee = (l: LigneSaisie) => l.type !== "PART_VARIABLE" && ligneCalculee(l);

/** Le brut d'une ligne en centimes, ou null tant que le montant, ou la quantité et le prix, ne sont pas lisibles. */
function brutDe(l: LigneSaisie): number | null {
  try { return calculee(l) ? montantCalcule(l) : centimesDepuisSaisie(l.montant); } catch { return null; }
}
/** La remise propre de la ligne, null si elle suit la version ; undefined tant qu'elle ne se lit pas. */
function remiseDe(l: LigneSaisie): number | null | undefined {
  if (l.remise.trim() === "") return null;
  try { return pourMilleDepuisSaisie(l.remise); } catch { return undefined; }
}

/** Une remarque du préremplissage, telle que le serveur la renvoie : son code, sa cible et sa phrase. */
export type RemarqueEcran = { code: string; centreId: number | null; tarif: string | null; message: string };
/** Ce que la réponse d'un préremplissage dit à l'écran : la grille réellement utilisée et les remarques. */
export type PreremplissageEcran = { applicableLe: string | null; remarques: RemarqueEcran[] };
/** Une remarque est unique par code, centre et tarif : c'est sa clé. */
const cleRemarque = (r: RemarqueEcran) => `${r.code}|${r.centreId ?? ""}|${r.tarif ?? ""}`;
const phrasePreremplie = (jour: string | null | undefined) => jour ? `Lignes préremplies avec la grille du ${jourFr(jour)}.` : null;

/**
 * Les lignes d'une version en brouillon, en cartes empilées (jamais un tableau :
 * aucun défilement horizontal à 375 px), la remise, puis le récapitulatif
 * calculé par `totauxProposition` : brut, remise, gestes commerciaux et net.
 * `remarques` : ce que le préremplissage vient de dire (pourquoi une ligne manque).
 * `grillePreremplie` : le jour de la grille dont la création préremplie a tiré
 * ses lignes, selon le serveur. `grilleDu` : le jour de la grille en vigueur lu
 * au chargement. Un brouillon se repréremplit avec la grille en vigueur : ses
 * lignes sont remplacées par le serveur, après confirmation, et la réponse dit
 * de quelle grille elles viennent. L'enregistrement envoie la version lue : si
 * un préremplissage a eu lieu ailleurs entre-temps, le serveur répond 409.
 */
export function DialogueProposition({ proposition: p, catalogue, centres, remarques: remarquesInitiales = [], grillePreremplie = null, grilleDu = null, fermer, termine }: {
  proposition: PropositionFiche; catalogue: { id: number; name: string }[]; centres: { id: number; nom: string }[];
  remarques?: RemarqueEcran[]; grillePreremplie?: string | null; grilleDu?: string | null; fermer: () => void; termine: (message: string) => void;
}) {
  const router = useRouter();
  const brouillon = p.statut === "BROUILLON";
  const [lignes, setLignes] = useState<LigneSaisie[]>(p.lignes.map(saisieDepuisLigne));
  const [remise, setRemise] = useState(saisieRemise(p.remisePourMille));
  const [remarques, setRemarques] = useState(remarquesInitiales);
  /** La version lue : elle avance quand le préremplissage réécrit les lignes. */
  const [majLe, setMajLe] = useState(p.majLe);
  const [confirmer, setConfirmer] = useState(false);
  const [preremplissage, setPreremplissage] = useState<{ enCours: boolean; erreur: string | null; fait: string | null }>({ enCours: false, erreur: null, fait: phrasePreremplie(grillePreremplie) });
  async function preremplir() {
    setPreremplissage({ enCours: true, erreur: null, fait: null });
    try {
      const r = await envoyer<{ proposition: PropositionFiche; preremplissage: PreremplissageEcran }>(
        `/api/pilot/propositions/${p.id}/preremplir`, "POST", undefined, { majLe });
      setLignes(r.proposition.lignes.map(saisieDepuisLigne));
      setMajLe(r.proposition.majLe);
      setRemarques(r.preremplissage.remarques);
      // La grille réellement utilisée, selon le serveur : elle a pu changer depuis le chargement de la page.
      const jour = r.preremplissage.applicableLe ?? grilleDu;
      setPreremplissage({ enCours: false, erreur: null, fait: jour ? `Lignes remplacées par celles de la grille du ${jourFr(jour)}.` : "Lignes remplacées par celles de la grille." });
      router.refresh();
    } catch (e) {
      setPreremplissage({ enCours: false, erreur: e instanceof Error ? e.message : "Le préremplissage a échoué.", fait: null });
    } finally { setConfirmer(false); }
  }
  function convertir() {
    lignes.forEach((l, i) => { const refus = refusLigne(l); if (refus) throw new Error(`Ligne ${i + 1} : ${refus}`); });
    return lignes.map(ligneDepuisSaisie);
  }
  function modifier(index: number, champs: Partial<LigneSaisie>) {
    setLignes((ls) => ls.map((l, i) => i === index ? { ...l, ...champs } : l));
  }
  let totaux: ReturnType<typeof totauxProposition> | null = null;
  let remisePourMille: number | null = null;
  // Une ligne dont le montant n'est pas encore saisi compte pour 0 dans le récapitulatif : il reste lisible pendant la saisie.
  try {
    remisePourMille = pourMilleDepuisSaisie(remise);
    totaux = totauxProposition(lignes.map((l) => {
      const r = remiseDe(l);
      if (r === undefined) throw new Error("Remise de ligne illisible.");
      return { type: l.type, montantCentimes: brutDe(l) ?? 0, offerte: l.offerte, remisePourMille: r, unite: l.type === "PART_VARIABLE" ? l.unite : null };
    }), remisePourMille);
  } catch { /* La saisie peut être incomplète. */ }
  const aChiffrer = lignes.filter((l) => { const brut = brutDe(l); return brut !== null && estAChiffrer({ montantCentimes: brut, offerte: l.offerte, type: l.type }); }).length;
  const phraseChiffrer = phraseAChiffrer(aChiffrer);
  return <DialogueFormulaire titre={(brouillon ? "Modifier la version " : "Compléter la version ") + p.version} maxWidth="md" fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/propositions/" + p.id, "PATCH", modificationProposition, {
      operation: "modifier", documentUrl: texte(f, "documentUrl").trim() || null, notes: texte(f, "notes"),
      reponseClient: texte(f, "reponseClient"),
      // Les lignes partent avec la version lue : un préremplissage fait ailleurs depuis donne 409, jamais un écrasement.
      ...(brouillon ? { lignes: convertir(), majLe, remisePourMille: pourMilleDepuisSaisie(remise),
        engagementMois: nombreFacultatif(f, "engagementMois"), preavisMois: nombreFacultatif(f, "preavisMois"),
        valideJusquAu: texte(f, "valideJusquAu") || null } : {}),
    });
    termine("Version " + p.version + " enregistrée.");
  }}>
    {brouillon && <>
      {grilleDu && <Box data-preremplir>
        {!confirmer
          ? <Button variant="outlined" disabled={preremplissage.enCours} onClick={() => setConfirmer(true)} sx={{ whiteSpace: "normal", textAlign: "left", maxWidth: "100%" }}>
            Préremplir avec la grille du {jourFr(grilleDu)}
          </Button>
          : <Alert icon={false} severity="warning" data-confirmer-preremplir>
            <Typography component="div" sx={{ mb: 1 }}>
              Les lignes actuelles seront remplacées par celles de la grille, tout de suite, même si vous fermez ce dialogue sans enregistrer.
              {" "}Vos modifications de lignes non enregistrées seront perdues. La remise et le reste ne changent pas.
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
              <Button variant="outlined" color="warning" disabled={preremplissage.enCours} onClick={() => void preremplir()}>Remplacer les lignes</Button>
              <Button disabled={preremplissage.enCours} onClick={() => setConfirmer(false)}>Annuler</Button>
            </Stack>
          </Alert>}
        {preremplissage.erreur && <Alert icon={false} severity="error" sx={{ mt: 1 }}>{preremplissage.erreur}</Alert>}
        {preremplissage.fait && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} role="status">{preremplissage.fait}</Typography>}
      </Box>}
      {remarques.length > 0 && <Alert icon={false} severity="info" data-remarques>
        <Typography component="div" fontWeight={600} sx={{ mb: 0.5 }}>Préremplissage avec la grille</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{remarques.map((r) => <li key={cleRemarque(r)}>{r.message}</li>)}</Box>
      </Alert>}
      {phraseChiffrer && <Alert icon={false} severity="warning" data-a-chiffrer>{phraseChiffrer}</Alert>}
      {!lignes.length && <Typography color="text.secondary">Aucune ligne. Ajoutez un produit du catalogue, ou une ligne hors grille pour une facturation spécifique.</Typography>}
      {lignes.map((l, i) => {
        const brut = brutDe(l);
        const remiseLigne = remiseDe(l);
        const net = brut !== null && remisePourMille !== null && remiseLigne !== undefined ? montantNetLigne({ montantCentimes: brut, offerte: l.offerte, remisePourMille: remiseLigne }, remisePourMille) : null;
        const auCalcul = calculee(l);
        const horsCatalogue = l.productId === "";
        const prixARenseigner = brut !== null && estAChiffrer({ montantCentimes: brut, offerte: l.offerte, type: l.type });
        const conseil = conseilLigne(l);
        return <Stack key={i} spacing={2} data-ligne={i + 1} sx={{ border: 1, borderColor: prixARenseigner ? "warning.main" : "divider", borderRadius: "14px", p: 2 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
            <Typography variant="h3">Ligne {i + 1}</Typography>
            {prixARenseigner && <Chip size="small" color="warning" variant="outlined" label="Prix à renseigner" />}
            {l.offerte && <Chip size="small" variant="outlined" label="Offert" />}
            <Button sx={{ ml: "auto" }} onClick={() => setLignes((ls) => ls.filter((_, index) => index !== i))} aria-label={"Retirer la ligne " + (i + 1)}>Retirer la ligne</Button>
          </Stack>
          <Box sx={DEUX_COLONNES}>
            <TextField label="Produit" select fullWidth autoFocus={i === 0} value={l.productId} onChange={(e) => modifier(i, { productId: e.target.value === "" ? "" : Number(e.target.value) })}
              SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Hors catalogue</MenuItem>
              {catalogue.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField label="Centre" select fullWidth value={l.centreId} onChange={(e) => modifier(i, { centreId: e.target.value === "" ? "" : Number(e.target.value) })}
              SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Toute l&apos;organisation</MenuItem>{centres.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
            </TextField>
          </Box>
          <TextField label={horsCatalogue ? "Libellé" : "Libellé, facultatif"} required={horsCatalogue} value={l.libelle} onChange={(e) => modifier(i, { libelle: e.target.value })} inputProps={{ maxLength: 500 }}
            helperText={horsCatalogue ? "Sans produit du catalogue, dites ce que vous facturez : vente de RIS, formation…" : undefined} />
          <Box sx={DEUX_COLONNES}>
            <TextField label="Type" select fullWidth value={l.type} onChange={(e) => modifier(i, { type: e.target.value as CrmTypeLigne })} helperText={aideType(l.type)}>
              {TYPES_LIGNE_SAISIS.map((v) => <MenuItem key={v} value={v}>{LIBELLES_LIGNE[v]}</MenuItem>)}
            </TextField>
            <TextField label="Remise de la ligne en %, facultative" fullWidth value={l.remise} onChange={(e) => modifier(i, { remise: e.target.value })} inputProps={CHAMP_DECIMAL}
              error={remiseLigne === undefined}
              helperText={remiseLigne === undefined ? "De 0 à 100 %, une décimale au plus." : l.remise.trim() === "" ? "Vide : la remise de la version s'applique." : "Elle remplace la remise de la version pour cette ligne."} />
          </Box>
          {l.type !== "PART_VARIABLE" && <Box sx={DEUX_COLONNES}>
            <TextField label="Quantité" fullWidth value={l.quantite} onChange={(e) => modifier(i, { quantite: e.target.value })} inputProps={{ inputMode: "numeric", maxLength: 6 }}
              helperText="Le nombre de salles, de sites… Vide pour saisir un montant global." />
            <TextField label="Compté" select fullWidth value={l.base} onChange={(e) => modifier(i, { base: e.target.value as CrmBaseTarif | "" })} disabled={!auCalcul}
              SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">À l&apos;unité</MenuItem>
              {Object.entries(BASES_QUANTITE).map(([v, libelle]) => <MenuItem key={v} value={v}>{libelle}</MenuItem>)}
            </TextField>
          </Box>}
          <Box sx={DEUX_COLONNES}>
            {l.type !== "PART_VARIABLE" && <TextField label="Prix unitaire HT en euros" fullWidth value={l.prixUnitaire} onChange={(e) => modifier(i, { prixUnitaire: e.target.value })} inputProps={CHAMP_DECIMAL}
              required={auCalcul} helperText={auCalcul ? "Le prix d'une salle, d'un site. Deux décimales au plus." : "Avec une quantité, le montant se calcule."} />}
            <TextField label={l.type === "PART_VARIABLE" ? "Prix unitaire HT en euros" : "Montant HT en euros"} required={!auCalcul} fullWidth disabled={auCalcul}
              value={auCalcul ? (brut !== null ? saisieEuros(brut) : "") : l.montant} onChange={(e) => modifier(i, { montant: e.target.value })} inputProps={CHAMP_DECIMAL}
              helperText={auCalcul ? "Quantité × prix unitaire, avant remise." : conseil ?? (l.offerte ? "Le prix reste affiché : c'est ce que vous offrez." : "Deux décimales au plus, avant remise.")} />
          </Box>
          {l.type === "PART_VARIABLE" && <Box sx={DEUX_COLONNES}>
            <TextField label="Unité" select fullWidth value={l.unite} onChange={(e) => modifier(i, { unite: e.target.value as CrmUniteVariable })}>
              {Object.entries(LIBELLES_UNITE).map(([v, label]) => <MenuItem key={v} value={v}>{label}</MenuItem>)}
            </TextField>
            <TextField label="Volume inclus" type="number" fullWidth value={l.volume} onChange={(e) => modifier(i, { volume: e.target.value })} inputProps={{ min: 0, step: 1, max: 2147483647 }} />
          </Box>}
          <Box>
            <FormControlLabel label="Offert" control={<Checkbox checked={l.offerte} onChange={(e) => modifier(i, { offerte: e.target.checked })} />} />
            <Typography variant="caption" color="text.secondary" component="div">
              {l.offerte ? "Geste commercial : le prix reste affiché, barré, et le net de cette ligne est de 0,00 €." : "Cochez pour offrir cette ligne au client : le prix reste affiché, le net est de 0,00 €."}
            </Typography>
          </Box>
          {net !== null && brut !== null && <Typography variant="body2" color="text.secondary" component="div" data-net-ligne>
            {l.offerte
              ? brut === 0 ? <>Offert, sans prix affiché.</> : <>Brut <Box component="s">{eurosPrecis(brut)}</Box>, offert. Net : {eurosPrecis(net)}.</>
              : <>{auCalcul && brut !== null ? `${l.quantite.trim()} × ${eurosPrecis(centimesDepuisSaisie(l.prixUnitaire))} = ${eurosPrecis(brut)}. ` : ""}Net après remise : {eurosPrecis(net)}.</>}
          </Typography>}
        </Stack>;
      })}
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
        <Button variant="outlined" onClick={() => setLignes((ls) => [...ls, ligneCatalogue(catalogue[0]?.id ?? "")])}>Ajouter une ligne</Button>
        <Button variant="outlined" onClick={() => setLignes((ls) => [...ls, ligneHorsGrille()])}>Ajouter une ligne hors grille</Button>
      </Stack>
      <TextField label="Remise en pourcentage" required value={remise} autoFocus={!lignes.length} onChange={(e) => setRemise(e.target.value)} inputProps={CHAMP_DECIMAL} helperText="De 0 à 100 %, une décimale au plus. Elle s'applique aux lignes sans remise propre, jamais aux lignes offertes." />
      <Box aria-live="polite"><Typography variant="h3" gutterBottom>Récapitulatif, hors taxe</Typography>
        {totaux ? <ZoneRecapitulatif totaux={totaux} /> : <Alert icon={false} severity="info">Complétez les montants et la remise pour calculer le récapitulatif.</Alert>}
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="engagementMois" label="Engagement en mois" type="number" fullWidth defaultValue={p.engagementMois ?? ""} inputProps={{ min: 0, max: 120, step: 1 }} />
        <TextField name="preavisMois" label="Préavis en mois" type="number" fullWidth defaultValue={p.preavisMois ?? ""} inputProps={{ min: 0, max: 120, step: 1 }} />
      </Stack>
      <TextField name="valideJusquAu" label="Valide jusqu'au" type="date" defaultValue={p.valideJusquAu?.slice(0, 10) ?? ""} InputLabelProps={{ shrink: true }} />
    </>}
    <TextField name="reponseClient" label="Réponse du client" autoFocus={!brouillon} multiline minRows={2} defaultValue={p.reponseClient ?? ""} inputProps={{ maxLength: 5000 }} />
    <TextField name="documentUrl" label="Lien du document" type="url" defaultValue={p.documentUrl ?? ""} helperText="Lien https uniquement, facultatif." />
    <TextField name="notes" label="Notes" multiline minRows={2} defaultValue={p.notes ?? ""} inputProps={{ maxLength: 5000 }} />
  </DialogueFormulaire>;
}

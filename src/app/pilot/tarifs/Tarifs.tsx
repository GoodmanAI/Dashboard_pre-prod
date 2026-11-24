"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import { IconTag } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne, Vide } from "@/pilot/components/Bloc";
import { compter } from "@/pilot/lib/texte";
import {
  PHRASE_LECTURE_SEULE, PRIX_A_RENSEIGNER, aideTarifARenseigner, droitsGrille, jourFr, libelleBase, montantTarif, phraseGrille, phraseGrilleSansTarif, titreGrille,
} from "@/pilot/lib/tarifs/affichage";
import { ROLES, avertissementProduit, roleDuCode } from "@/pilot/lib/tarifs/roles";
import { DialogueGrille, DialogueModifierGrille, DialogueSuppressionGrille, DialogueSuppressionTarif, DialogueTarif } from "./DialoguesTarif";
import type { GrilleEcran, TarifEcran } from "./types";

type Dialogue =
  | { type: "grille"; copierDe: number | null } | { type: "modifierGrille"; grille: GrilleEcran }
  | { type: "tarif"; grille: GrilleEcran; tarif?: TarifEcran } | { type: "retirer"; grille: GrilleEcran; tarif: TarifEcran }
  | { type: "supprimerGrille"; grille: GrilleEcran };

/**
 * Les tarifs (lot S) : la grille en vigueur, la prochaine grille datée, puis les
 * grilles passées, repliées. Tous les montants sont hors taxe, dits une fois en
 * tête. Un prix vide se lit « Prix à renseigner », avec comment le remplir. Sans
 * le droit « Modifier les montants », aucun bouton d'écriture et une phrase le dit.
 * Chaque tarif dit son rôle et, pour un rôle de produit, le produit relié,
 * l'absence de produit (ses lignes préremplies seraient hors catalogue) ou un
 * produit qui n'est pas celui du rôle (un tarif ancien, d'avant la règle).
 * Une grille à venir sans tarif dit qu'elle s'appliquerait sans aucun prix.
 */
export function Tarifs({ grilles, catalogue, peutModifier }: { grilles: GrilleEcran[]; catalogue: { id: number; name: string }[]; peutModifier: boolean }) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const enVigueur = grilles.find((g) => g.statut === "EN_VIGUEUR") ?? null;
  // Les grilles arrivent de la plus lointaine à la plus ancienne : la prochaine, la plus proche, passe d'abord.
  const prochaines = grilles.filter((g) => g.statut === "PROCHAINE").reverse();
  const passees = grilles.filter((g) => g.statut === "PASSEE");
  const termine = (texte: string) => { setDialogue(null); setMessage(texte); router.refresh(); };
  const carte = (g: GrilleEcran) => <CarteGrille key={g.id} grille={g} peutModifier={peutModifier} catalogue={catalogue}
    supprimer={() => setDialogue({ type: "supprimerGrille", grille: g })}
    modifierGrille={() => setDialogue({ type: "modifierGrille", grille: g })} copier={() => setDialogue({ type: "grille", copierDe: g.id })}
    ajouter={() => setDialogue({ type: "tarif", grille: g })} modifierTarif={(tarif) => setDialogue({ type: "tarif", grille: g, tarif })}
    retirer={(tarif) => setDialogue({ type: "retirer", grille: g, tarif })} />;

  return <Stack spacing={2.5}>
    <EnTete titre="Tarifs" sousTitre="La grille de prix de Lyrae. Tous les montants sont hors taxe (HT).">
      {peutModifier && <Button variant="contained" onClick={() => setDialogue({ type: "grille", copierDe: enVigueur?.id ?? null })}>Créer une nouvelle grille datée</Button>}
    </EnTete>
    {!peutModifier && <Typography variant="body2" color="text.secondary">{PHRASE_LECTURE_SEULE}</Typography>}

    {!grilles.length && <Vide>
      Aucune grille tarifaire.{" "}
      {peutModifier ? "Créez la première avec « Créer une nouvelle grille datée »." : "Demandez à un compte qui peut modifier les montants d'en créer une."}
    </Vide>}
    {enVigueur ? carte(enVigueur) : !!grilles.length && <Vide>
      Aucune grille n&apos;est en vigueur{prochaines.length ? `. La prochaine s'applique à partir du ${jourFr(prochaines[0].applicableLe)}` : ""}.
      {" "}Tant qu&apos;aucune ne l&apos;est, les propositions ne se préremplissent pas.
    </Vide>}
    {prochaines.map(carte)}
    {!!passees.length && <Box component="details" sx={{ "& > summary": { cursor: "pointer", fontWeight: 500, py: 0.5 } }}>
      <Box component="summary">Grilles passées ({passees.length})</Box>
      <Stack spacing={2.5} sx={{ mt: 1.5 }}>{passees.map(carte)}</Stack>
    </Box>}

    {dialogue?.type === "grille" && <DialogueGrille grilles={grilles} copierDe={dialogue.copierDe} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "modifierGrille" && <DialogueModifierGrille grille={dialogue.grille} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "tarif" && <DialogueTarif grille={dialogue.grille} tarif={dialogue.tarif} catalogue={catalogue} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "retirer" && <DialogueSuppressionTarif grille={dialogue.grille} tarif={dialogue.tarif} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue?.type === "supprimerGrille" && <DialogueSuppressionGrille grille={dialogue.grille} fermer={() => setDialogue(null)} termine={termine} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Stack>;
}

function CarteGrille({ grille: g, peutModifier, catalogue, modifierGrille, copier, ajouter, modifierTarif, retirer, supprimer }: {
  grille: GrilleEcran; peutModifier: boolean; catalogue: { id: number; name: string }[]; modifierGrille: () => void; copier: () => void; ajouter: () => void;
  modifierTarif: (t: TarifEcran) => void; retirer: (t: TarifEcran) => void; supprimer: () => void;
}) {
  const droits = droitsGrille(g, peutModifier);
  const usage = g.nombrePropositions > 0 ? ` · ${compter(g.nombrePropositions, "proposition l'utilise", "propositions l'utilisent")}` : "";
  return <Bloc titre={titreGrille(g.applicableLe)} nombre={phraseGrille(g.statut, g.applicableLe) + usage} icone={IconTag} teinte={g.statut === "EN_VIGUEUR" ? "vert" : g.statut === "PROCHAINE" ? "orange" : "gris"} sx={{ minWidth: 0 }}>
    <Box data-grille={g.id}>
      {g.notes && <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{g.notes}</Typography>}
      {droits.phrase && <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 1.25 }} data-raison>{droits.phrase}</Typography>}
      {g.tarifs.length ? g.tarifs.map((t) => {
        const aRenseigner = t.base !== "POURCENTAGE" && t.montantHtCentimes === null;
        const role = roleDuCode(t.code);
        const produit = t.productId === null ? null : catalogue.find((p) => p.id === t.productId)?.name ?? null;
        const avertissement = avertissementProduit(role, produit);
        return <Ligne key={t.id} data-tarif={t.code} data-role={role}
          nom={<Box component="span" sx={{ overflowWrap: "anywhere" }}>{t.libelle}</Box>}
          detail={<>
            {ROLES[role].libelle} · {libelleBase(t)}
            {ROLES[role].produit !== null && (avertissement
              ? <Typography component="div" variant="caption" color="warning.main" sx={{ mt: 0.25 }} data-produit-non-relie={produit === null ? "" : undefined}
                data-mauvais-produit={produit === null ? undefined : ""}>{avertissement}</Typography>
              : <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.25 }} data-produit>Produit : {produit}</Typography>)}
            {aRenseigner && <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>{aideTarifARenseigner(droits)}</Typography>}
          </>}
          date={<Typography component="div" variant="body2" fontWeight={500} color={aRenseigner ? "warning.main" : "text.primary"} sx={{ fontVariantNumeric: "tabular-nums" }}>
            {aRenseigner ? PRIX_A_RENSEIGNER : montantTarif(t)}
          </Typography>}>
          {droits.modifier && <>
            <Button size="small" variant={aRenseigner ? "outlined" : "text"} onClick={() => modifierTarif(t)} aria-label={`${aRenseigner ? "Renseigner le prix de" : "Modifier"} ${t.libelle}`}>
              {aRenseigner ? "Renseigner le prix" : "Modifier"}
            </Button>
            <Button size="small" onClick={() => retirer(t)} aria-label={`Retirer ${t.libelle}`}>Retirer</Button>
          </>}
        </Ligne>;
      }) : <Typography variant="body2" color={g.statut === "PROCHAINE" ? "warning.main" : "text.secondary"} sx={{ px: 2.75, pb: 1.5 }} data-grille-vide>
        {phraseGrilleSansTarif(g.statut, g.applicableLe, droits.modifier)}
      </Typography>}
      {(droits.modifier || droits.copier) && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ px: 2.75, pt: 1.5, pb: 2.25 }}>
        {droits.modifier && <Button variant="outlined" onClick={ajouter}>Ajouter un tarif</Button>}
        {droits.modifier && <Button variant="outlined" onClick={modifierGrille}>Modifier la grille</Button>}
        {droits.modifier && g.supprimable && <Button color="error" onClick={supprimer}>Supprimer cette grille</Button>}
        {droits.copier && !droits.modifier && <Button variant="outlined" onClick={copier}>Créer une nouvelle grille datée</Button>}
      </Stack>}
    </Box>
  </Bloc>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import { modificationEchange, modificationProchaineAction } from "@/pilot/lib/validation/echange";
import { changementEtape } from "@/pilot/lib/validation/organisation";
import { dansJours } from "@/pilot/lib/dates";

export function ChampsSuite({ type = false }: { type?: boolean }) {
  return <>
    {/* Le compte rendu d'abord : c'est ce qu'on a en tête en revenant d'un appel.
        Le type n'est utile que si un échange est noté, d'où « Appel » par défaut. */}
    <TextField name="compteRendu" label="Ce qui s'est passé" multiline minRows={2} autoFocus inputProps={{ maxLength: 5000 }}
      helperText={type ? "Facultatif. Laissez vide pour marquer l'action faite sans noter d'échange." : undefined} />
    {type && <TextField select name="type" label="Type d'échange" defaultValue="APPEL">
      {Object.entries(LIBELLES_ECHANGE).filter(([cle]) => cle !== "JALON").map(([cle, libelle]) => <MenuItem key={cle} value={cle}>{libelle}</MenuItem>)}
    </TextField>}
    <TextField name="prochaineAction" label="Prochaine action" inputProps={{ maxLength: 500 }} />
    <TextField name="prochaineActionLe" label="Pour le" type="date" InputLabelProps={{ shrink: true }} />
  </>;
}
function suite(f: FormData) {
  return { compteRendu: String(f.get("compteRendu") ?? "").trim() || null,
    prochaineAction: String(f.get("prochaineAction") ?? "").trim() || null,
    prochaineActionLe: String(f.get("prochaineActionLe") ?? "") || null };
}
/** `jalon` : un jalon du plan de signature se franchit, il ne porte pas de compte rendu. */
export function ActionsSuivi({ organisationId, echangeId, le, termine, jalon = false }: {
  organisationId: number; echangeId?: number; le: string | null; termine?: () => void; jalon?: boolean;
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<"faite" | "realiser" | "replanifier" | "annuler" | null>(null);
  const rdv = echangeId !== undefined;
  const url = rdv ? `/api/pilot/echanges/${echangeId}` : `/api/pilot/organisations/${organisationId}/prochaine-action`;
  const titres = { faite: "Marquer l'action faite", realiser: jalon ? "Étape clé franchie" : "Rendez-vous réalisé", replanifier: "Replanifier",
    annuler: jalon ? "Annuler cette étape clé ?" : "Annuler ce rendez-vous ?" };
  return <>
    <Stack direction="row" spacing={0.5} flexWrap="wrap">
      <Button onClick={() => setOperation(rdv ? "realiser" : "faite")}>{jalon ? "Franchi" : rdv ? "Réalisé" : "Fait"}</Button>
      <Button onClick={() => setOperation("replanifier")}>Replanifier</Button>
      {rdv && <Button onClick={() => setOperation("annuler")}>Annuler</Button>}
    </Stack>
    {operation && <DialogueFormulaire titre={titres[operation]} fermer={() => setOperation(null)}
      suppression={operation === "annuler"} bouton={operation === "annuler" ? "Confirmer l'annulation" : "Enregistrer"}
      soumettre={async (f) => {
        let donnees: object = { operation };
        if (operation === "replanifier") donnees = { operation, le: String(f.get("le")) };
        if (operation === "realiser") donnees = jalon ? { operation } : { operation, ...suite(f) };
        if (operation === "faite") {
          const contenu = suite(f);
          const type = String(f.get("type") ?? "APPEL");
          // Un échange n'est noté que si quelque chose est saisi.
          donnees = { operation, ...(Object.values(contenu).some(Boolean) ? { suite: { ...contenu, type } } : {}) };
        }
        await envoyer(url, "PATCH", rdv ? modificationEchange : modificationProchaineAction, donnees);
        setOperation(null); router.refresh(); termine?.();
      }}>
      {operation === "replanifier" ? <TextField name="le" label="Nouvelle date" type="date" required autoFocus
        defaultValue={le?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} InputLabelProps={{ shrink: true }}
        inputProps={rdv ? { min: new Date().toISOString().slice(0, 10) } : undefined} /> :
        operation === "annuler" ? <Typography>{jalon ? "L'étape clé" : "Le rendez-vous"} restera dans la chronologie avec la mention « Annulé ».</Typography> :
        jalon ? <Typography>L&apos;étape clé sera marquée comme franchie.</Typography> : <ChampsSuite type={operation === "faite"} />}
    </DialogueFormulaire>}
  </>;
}

export function ActionsReveil({ organisationId, reveilLe }: { organisationId: number; reveilLe: string }) {
  const router = useRouter();
  const [repousser, setRepousser] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const url = `/api/pilot/organisations/${organisationId}/etape`;
  return <>
    <Stack direction="row" spacing={0.5}>
      <Button disabled={envoi} onClick={async () => {
        setEnvoi(true); setErreur(null);
        try { await envoyer(url, "PATCH", changementEtape, { etape: "PROSPECT" }); router.refresh(); }
        catch (e) { setErreur(e instanceof Error ? e.message : "La reprise a échoué."); }
        finally { setEnvoi(false); }
      }}>Repasser en prospect</Button>
      <Button onClick={() => setRepousser(true)}>Repousser</Button>
    </Stack>
    {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
    {repousser && <DialogueFormulaire titre="Repousser la reprise" fermer={() => setRepousser(false)} soumettre={async (f) => {
      await envoyer(url, "PATCH", changementEtape, { etape: "EN_SOMMEIL", reveilLe: String(f.get("reveilLe")) });
      setRepousser(false); router.refresh();
    }}>
      <TextField autoFocus required name="reveilLe" label="Date de reprise" type="date" defaultValue={reveilLe.slice(0, 10)}
        inputProps={{ min: dansJours(new Date(), 1).toISOString().slice(0, 10) }} InputLabelProps={{ shrink: true }} />
    </DialogueFormulaire>}
  </>;
}

"use client";

import { IconCalendarDue, IconFilterCheck, IconPhone } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { CRITERES_QUALIFICATION, type Qualification } from "@/pilot/lib/organisations/qualification";
import { majOrganisation } from "@/pilot/lib/validation/organisation";
import { TITRE_BLOC_CASES } from "@/pilot/lib/organisations/temperatureAffichage";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { typeSuggere } from "@/pilot/lib/concurrents/designation";
import { Bloc } from "@/pilot/components/Bloc";
import { compter } from "@/pilot/lib/texte";
import { JETONS } from "@/pilot/jetons";
import { envoyer } from "./DialogueFormulaire";
import { SelecteurConcurrent } from "./SelecteurConcurrent";

function useEnregistrement(id: number) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const enAttente = useRef(0);
  /** Vrai si l'enregistrement a réussi : l'appelant remet sa valeur en place sinon. */
  async function enregistrer(donnees: object): Promise<boolean> {
    enAttente.current += 1;
    setEnvoi(true); setErreur(null); setMessage(null);
    // Sérialiser conserve aussi le second champ quitté pendant un enregistrement.
    const ecriture = file.current.then(() => envoyer(`/api/pilot/organisations/${id}`, "PATCH", majOrganisation, donnees));
    file.current = ecriture.catch(() => undefined);
    try { await ecriture; setMessage("Enregistré."); router.refresh(); return true; }
    catch (e) { setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué."); return false; }
    finally { enAttente.current -= 1; setEnvoi(enAttente.current > 0); }
  }
  return { envoi, message, erreur, enregistrer };
}

function Etat({ envoi, message, erreur, repos }: { envoi: boolean; message: string | null; erreur: string | null; repos?: string }) {
  return <>
    {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
    <Typography variant="caption" color="text.secondary" role="status">{envoi ? "Enregistrement…" : message ?? repos}</Typography>
  </>;
}

export function QualificationOrganisation({ org }: { org: Qualification & { id: number } }) {
  const { enregistrer, ...etat } = useEnregistrement(org.id);
  const cles = Object.keys(CRITERES_QUALIFICATION) as (keyof Qualification)[];
  // Pas de compteur : la température est le seul score de la fiche. Les cases disent seulement ce qui compte dedans.
  return <Bloc icone={IconFilterCheck} teinte="menthe" titre={TITRE_BLOC_CASES}>
    <Stack sx={{ px: 2.5, pb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ pb: 0.5 }}>Besoin et budget comptent dans la température. La solution actuelle n&apos;y compte pas.</Typography>
      {cles.map((cle) => <FormControlLabel key={cle} label={CRITERES_QUALIFICATION[cle]} sx={{ m: 0, minHeight: 40, "& + &": { borderTop: `1px solid ${JETONS.filetInterne}` }, "& .MuiFormControlLabel-label": { fontWeight: 500 } }} control={
        <Checkbox checked={org[cle]} disabled={etat.envoi} onChange={(_, valeur) => void enregistrer({ [cle]: valeur })} sx={{ ml: -0.75, mr: 0.5 }} />} />)}
      <Etat {...etat} />
    </Stack>
  </Bloc>;
}

const JOUR_MS = 86400000;
function echeance(valeur: string) {
  const jours = Math.round((new Date(valeur).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime()) / JOUR_MS);
  return jours === 0 ? "Aujourd'hui" : jours > 0 ? `Dans ${compter(jours, "jour")}` : `Dépassée de ${compter(-jours, "jour")}`;
}

export function DecisionAttendue({ org }: { org: { id: number; decisionAttendueLe: string | null } }) {
  const { enregistrer, ...etat } = useEnregistrement(org.id);
  const [edition, setEdition] = useState(false);
  const jour = org.decisionAttendueLe?.slice(0, 10) ?? null;
  return <Bloc icone={IconCalendarDue} teinte="orange" titre="Décision attendue" entete={jour && !edition ? <Button size="small" onClick={() => setEdition(true)}>Modifier</Button> : undefined}>
    <Stack spacing={1} sx={{ px: 2.5, pt: 0.5, pb: 2.25 }}>
      {jour && !edition ? <Box>
        <Typography variant="h5" component="p">{new Date(jour).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</Typography>
        <Typography variant="body2" color="text.secondary" suppressHydrationWarning>{echeance(jour)}</Typography>
      </Box> : <TextField label="Décision attendue" type="date" defaultValue={jour ?? ""} autoFocus={edition} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 220 }}
        onBlur={(e) => { setEdition(false); if ((e.target.value || null) !== jour) void enregistrer({ decisionAttendueLe: e.target.value || null }); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
      <Etat {...etat} repos={jour ? undefined : "Sans date, aucune alerte ne signale une décision dépassée."} />
    </Stack>
  </Bloc>;
}

export function SolutionActuelle({ org, concurrents }: { org: { id: number; solutionActuelle: string | null; concurrentId: number | null; outilRdv?: string | null }; concurrents: OptionConcurrent[] }) {
  const { enregistrer, ...etat } = useEnregistrement(org.id);
  const [edition, setEdition] = useState(false);
  // La valeur affichée suit la page ; entre l'enregistrement et la relecture, elle garde le choix qui vient d'être fait.
  const [concurrentId, setConcurrentId] = useState(org.concurrentId);
  useEffect(() => setConcurrentId(org.concurrentId), [org.concurrentId]);
  const enPlace = concurrents.find((c) => c.id === concurrentId);
  return <Bloc icone={IconPhone} teinte="cyan" titre="Solution actuelle" entete={!edition ? <Button size="small" onClick={() => setEdition(true)}>Modifier</Button> : undefined}>
    <Stack spacing={1.5} sx={{ px: 2.5, pt: 0.5, pb: 2.25 }}>
      {edition ? <TextField label="Solution actuelle" defaultValue={org.solutionActuelle ?? ""} autoFocus inputProps={{ maxLength: 2000 }}
        onBlur={(e) => { setEdition(false); if ((e.target.value.trim() || null) !== org.solutionActuelle) void enregistrer({ solutionActuelle: e.target.value }); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> :
        org.solutionActuelle ? <Typography sx={{ overflowWrap: "anywhere" }}>{org.solutionActuelle}</Typography> :
        <Typography variant="body2" color="text.secondary">Non renseignée. Précisez le standard ou le prestataire en place.</Typography>}
      <SelecteurConcurrent concurrents={concurrents} valeur={concurrentId} libelle="Concurrent en place" typeParDefaut={typeSuggere(org.outilRdv)}
        aide="Facultatif. Choisissez le concurrent dans la liste, ou saisissez un nom pour le créer."
        changer={(id) => { const avant = concurrentId; setConcurrentId(id); void enregistrer({ concurrentId: id }).then((ok) => { if (!ok) setConcurrentId(avant); }); }} />
      {enPlace && <Box><Link href={`/pilot/concurrents/${enPlace.id}`}>Voir la fiche de {enPlace.nom}</Link></Box>}
      <Etat {...etat} />
    </Stack>
  </Bloc>;
}

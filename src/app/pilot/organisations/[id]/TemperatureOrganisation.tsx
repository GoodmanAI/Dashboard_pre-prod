"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import { IconThermometer } from "@tabler/icons-react";
import { Bloc } from "@/pilot/components/Bloc";
import { PastilleTemperature } from "@/pilot/components/PastilleTemperature";
import { DialogueForcageTemperature } from "@/pilot/components/formulaires/DialogueForcageTemperature";
import { compter } from "@/pilot/lib/texte";
import { conseilCritere, phraseForcage, resumeTemperature, type ActionCritere, type TemperatureFiche } from "@/pilot/lib/organisations/temperatureAffichage";
import { JETONS } from "@/pilot/jetons";

/**
 * La température du dossier (lot R) : le niveau affiché, ce que le barème a lu
 * critère par critère, et comment gagner des points. Un forçage se dit avec son
 * auteur et sa date, et le calcul reste visible à côté. Après la signature, un dossier perdu
 * ou en pause : une phrase, aucun détail.
 */
export function TemperatureOrganisation({ organisationId, temperature, modifiable, agir }: {
  organisationId: number; temperature: TemperatureFiche; modifiable: boolean; agir: (action: Exclude<ActionCritere, null>) => void;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { points, forcage, calculee, sansObjet } = temperature;
  // Quand le forçage diffère du calcul, le moteur ouvre ses raisons par « Forcée à … » : la phrase avec l'auteur la remplace.
  const raisons = temperature.forceeDiffere ? temperature.raisons.slice(1) : temperature.raisons;
  const resume = resumeTemperature(temperature);

  if (sansObjet) return <Bloc icone={IconThermometer} teinte="orange" titre="Température">
    <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 2.5 }}>{temperature.raisons[0]}</Typography>
  </Bloc>;

  return <Bloc icone={IconThermometer} teinte="orange" titre="Température" id="temperature"
    entete={modifiable ? <Button size="small" onClick={() => setDialogue(true)}>Corriger</Button> : undefined}>
    <Stack spacing={1.5} sx={{ px: 2.75, pt: 0.25, pb: 2.25 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center">
        {resume && <PastilleTemperature valeur={resume} grande />}
        <Typography variant="body2" color="text.secondary">{compter(points.total, "point")} sur {points.possibles}</Typography>
      </Stack>
      {forcage && <Typography sx={{ fontWeight: 500 }}>{phraseForcage(forcage, calculee)}</Typography>}
      <Stack spacing={0.5} component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
        {raisons.map((r) => <Typography key={r} component="li" variant="body2" color="text.secondary">{r}</Typography>)}
      </Stack>
      <Box component="ul" aria-label="Détail des points" sx={{ m: 0, p: 0, listStyle: "none", mt: 0.5 }}>
        {points.criteres.map((c) => {
          const conseil = conseilCritere(c);
          return <Box component="li" key={c.cle} sx={{ py: 1.25, borderTop: `1px solid ${JETONS.filetInterne}` }}>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Typography fontWeight={500}>{c.libelle}</Typography>
              <Typography variant="body2" fontWeight={600} color={c.points >= c.possibles ? "text.primary" : "text.secondary"} sx={{ whiteSpace: "nowrap" }}>
                {c.points} sur {c.possibles}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{c.valeur}</Typography>
            {conseil.texte && <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1} alignItems="center" sx={{ mt: 0.25 }}>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{conseil.texte}</Typography>
              {modifiable && conseil.action && <Button size="small" onClick={() => agir(conseil.action!)}>{conseil.action === "contact" ? "Ajouter un contact" : "Modifier"}</Button>}
            </Stack>}
          </Box>;
        })}
      </Box>
    </Stack>
    {dialogue && <DialogueForcageTemperature organisationId={organisationId} temperature={temperature} fermer={() => setDialogue(false)}
      termine={(texte) => { setDialogue(false); setMessage(texte); router.refresh(); }} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Bloc>;
}

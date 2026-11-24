"use client";

import { useState } from "react";
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from "@mui/material";
import type { CrmTemperature } from "@prisma/client";
import { LIBELLES_TEMPERATURE } from "@/pilot/lib/organisations/temperature";
import { NIVEAUX_TEMPERATURE, phraseForcage, type TemperatureFiche } from "@/pilot/lib/organisations/temperatureAffichage";
import { forcageTemperature, retraitTemperature } from "@/pilot/lib/validation/temperature";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

const CALCUL = "CALCUL";
const DETAILS: Record<CrmTemperature, string> = {
  CHAUD: "Le dossier avance vite, ou le client a fixé une échéance.",
  TIEDE: "Le dossier avance, sans urgence.",
  FROID: "Le dossier est lent, ou le client hésite.",
};

/**
 * Corriger la température d'un dossier (lot R) : trois niveaux, ou « Revenir au calcul »
 * quand un forçage existe. Enregistrer sans rien changer ferme la fenêtre sans écrire :
 * sans forçage, choisir le niveau du calcul ne pose pas de forçage ; avec un forçage,
 * choisir le niveau du calcul revient au calcul (le forçage est retiré, pas recopié).
 * La date du forçage lue par l'écran part avec la demande : si quelqu'un l'a changé
 * entre-temps, le serveur répond 409 et le dit.
 */
export function DialogueForcageTemperature({ organisationId, temperature, fermer, termine }: {
  organisationId: number; temperature: TemperatureFiche; fermer: () => void; termine: (message: string) => void;
}) {
  const { forcage, calculee } = temperature;
  const [choix, setChoix] = useState<string>(forcage?.temperature ?? calculee ?? "TIEDE");
  const url = `/api/pilot/organisations/${organisationId}/temperature`;
  return <DialogueFormulaire titre="Corriger la température" fermer={fermer} soumettre={async () => {
    const forceeLe = forcage?.le ?? null;
    if (choix === CALCUL || (forcage && choix !== forcage.temperature && choix === calculee)) {
      await envoyer(url, "DELETE", retraitTemperature, { forceeLe });
      termine("Le dossier reprend la température calculée.");
    } else if (forcage ? choix === forcage.temperature : choix === calculee) {
      // Rien ne change : ni le niveau forcé rejoué, ni un « forçage » égal au calcul. Rien n'est écrit.
      fermer();
    } else {
      await envoyer(url, "PUT", forcageTemperature, { temperature: choix, forceeLe });
      termine(`Température forcée : ${LIBELLES_TEMPERATURE[choix as CrmTemperature].toLowerCase()}.`);
    }
  }}>
    <Typography>
      {calculee ? `Le calcul dit ${LIBELLES_TEMPERATURE[calculee].toLowerCase()}, d'après ${temperature.points.total} points sur ${temperature.points.possibles}.` : "Le calcul ne donne pas de température."}
      {" "}Choisissez un autre niveau si vous connaissez mieux le dossier que le barème. Le niveau choisi reste en place tant que vous ne revenez pas au calcul.
    </Typography>
    {forcage && <Typography variant="body2" color="text.secondary">{phraseForcage(forcage, calculee)}</Typography>}
    <RadioGroup value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Température">
      {NIVEAUX_TEMPERATURE.map((n) => <FormControlLabel key={n} value={n} sx={{ alignItems: "flex-start", mb: 0.5, "& .MuiRadio-root": { mt: -0.75 } }} control={<Radio />}
        label={<Box><Box component="span" sx={{ fontWeight: 500 }}>{LIBELLES_TEMPERATURE[n]}</Box>
          <Typography variant="body2" color="text.secondary">{DETAILS[n]}</Typography>
          {forcage && n === calculee && n !== forcage.temperature && <Typography variant="body2" color="text.secondary">C&apos;est le niveau du calcul : le choisir revient au calcul.</Typography>}
        </Box>} />)}
      {forcage && <FormControlLabel value={CALCUL} sx={{ alignItems: "flex-start", "& .MuiRadio-root": { mt: -0.75 } }} control={<Radio />}
        label={<Box><Box component="span" sx={{ fontWeight: 500 }}>Revenir au calcul</Box>
          <Typography variant="body2" color="text.secondary">Le dossier reprend la température du barème{calculee ? `, aujourd'hui ${LIBELLES_TEMPERATURE[calculee].toLowerCase()}` : ""}.</Typography></Box>} />}
    </RadioGroup>
  </DialogueFormulaire>;
}

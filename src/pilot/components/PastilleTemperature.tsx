import Box from "@mui/material/Box";
import { IconThermometer } from "@tabler/icons-react";
import { TEMPERATURE } from "@/pilot/jetons";
import { LIBELLES_TEMPERATURE } from "@/pilot/lib/organisations/temperature";
import { libelleAccessible, type ResumeTemperature } from "@/pilot/lib/organisations/temperatureAffichage";

/**
 * La température d'un dossier en pastille discrète (lot R) : un thermomètre, un
 * mot et une teinte. Jamais la couleur seule. `avecMot` écrit « Température chaud »
 * là où la pastille n'a pas de titre de colonne à côté (en-tête de la fiche).
 */
export function PastilleTemperature({ valeur, avecMot = false, grande = false }: { valeur: ResumeTemperature; avecMot?: boolean; grande?: boolean }) {
  const c = TEMPERATURE[valeur.niveau];
  const mot = LIBELLES_TEMPERATURE[valeur.niveau];
  const texte = (avecMot ? `Température ${mot.toLowerCase()}` : mot) + (valeur.forcee ? ", forcée" : "");
  return <Box component="span" role="img" aria-label={libelleAccessible(valeur)} sx={{
    display: "inline-flex", alignItems: "center", gap: "5px", maxWidth: "100%", height: grande ? 28 : 22, px: grande ? "11px" : "8px", borderRadius: 980,
    bgcolor: c.fond, color: c.texte, fontSize: grande ? 14 : 12, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", verticalAlign: "middle" }}>
    <IconThermometer aria-hidden size={grande ? 16 : 13} stroke={2.25} />
    {texte}
  </Box>;
}

import { z } from "zod";
import { dateValide, identifiant, texteOptionnel } from "./commun";
import { decalerMois } from "@/pilot/lib/ca/projeter";

const lignes = z.array(z.object({
  opportuniteId: identifiant, cochee: z.boolean(),
  demarrageDecaleLe: dateValide.transform((d) => decalerMois(d, 0)).nullable(),
}).strict()).refine((valeurs) => new Set(valeurs.map((o) => o.opportuniteId)).size === valeurs.length,
  "Une opportunité ne peut figurer qu'une fois.");
export const creationScenario = z.object({
  nom: z.string().trim().min(1).max(120), notes: texteOptionnel(5000), opportunites: lignes,
}).strict();
export const modificationScenario = creationScenario.extend({ majLe: dateValide });

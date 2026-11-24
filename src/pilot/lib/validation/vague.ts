import { z } from "zod";
import { auMoinsUnChamp, dateValide, identifiant, texteOptionnel } from "./commun";

const vague = z.object({ nom: texteOptionnel(), datePromise: dateValide.nullable().optional() }).strict();
export const creationVague = vague.extend({ organisationId: identifiant });
export const majVague = vague.refine(auMoinsUnChamp, "Renseignez le nom ou la date promise de la vague.");

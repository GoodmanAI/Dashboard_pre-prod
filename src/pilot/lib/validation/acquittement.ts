import { z } from "zod";
import { dateValide, identifiant } from "./commun";

export const nouvelAcquittement = z.object({
  cleAlerte: z.string().trim().min(1).max(150), organisationId: identifiant,
  jusquAu: dateValide, raison: z.string().trim().min(1).max(500),
}).strict();

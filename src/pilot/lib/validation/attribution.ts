import { z } from "zod";
import { identifiant } from "./commun";

/** Confier une alerte à une personne (C-91). La clé est celle d'un signal affiché ou replié. */
export const nouvelleAttribution = z.object({
  organisationId: identifiant, cleAlerte: z.string().trim().min(1).max(150), userId: identifiant,
}).strict();

/** Désigner le directeur général (C-91). `majLe` : la version lue par l'écran Équipe, null sans directeur (C-26). */
export const designationDirecteur = z.object({
  userId: identifiant, majLe: z.string().datetime().nullable(),
}).strict();

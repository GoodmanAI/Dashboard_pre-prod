import { CrmTemperature } from "@prisma/client";
import { z } from "zod";
import { dateValide } from "./commun";

/**
 * Forcer la température d'un dossier (lot R). `forceeLe` est le forçage tel que
 * l'écran l'a lu : sa date, ou null s'il n'y en avait pas. Si quelqu'un a posé,
 * changé ou retiré le forçage depuis, le serveur répond 409 (C-26). La clé est
 * obligatoire pour qu'un appel n'oublie jamais de dire ce qu'il a lu.
 */
export const forcageTemperature = z.object({
  temperature: z.nativeEnum(CrmTemperature),
  forceeLe: dateValide.nullable(),
}).strict();

/** Le retrait peut rappeler ce qui a été lu ; sans corps, il retire ce qui est là. */
export const retraitTemperature = z.object({ forceeLe: dateValide.nullable().optional() }).strict();

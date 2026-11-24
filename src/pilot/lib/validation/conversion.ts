import { CrmEtapeCommerciale } from "@prisma/client";
import { z } from "zod";
import { debutDuJour } from "@/pilot/lib/dates";
import { dateValide } from "./commun";
import { contenuContrat } from "./contrat";

export const SIGNATURE_FUTURE = "La date de signature ne peut pas être dans le futur.";

/**
 * Convertir en client sans proposition : un contrat en brouillon daté, puis le
 * passage en Signé. Le début officiel reprend la règle du contrat. `etapeLue`
 * est l'étape affichée : si elle a changé depuis, le serveur répond 409.
 */
export const conversionClient = contenuContrat.pick({ debuteLe: true }).extend({
  etapeLue: z.nativeEnum(CrmEtapeCommerciale),
  // Une date illisible a déjà son refus : zod peut alors passer ici la chaîne brute, non transformée.
  signeLe: dateValide.refine((d) => !(d instanceof Date) || debutDuJour(d) <= debutDuJour(new Date()), SIGNATURE_FUTURE),
});

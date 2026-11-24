import { z } from "zod";
import { CrmTypeDemande } from "@prisma/client";
import { identifiant, texteOptionnel } from "./commun";

// Un jour : « 2026-11-12 » depuis un champ date, ou une date ISO complète quand le
// navigateur renvoie la valeur déjà validée. Ramené au début du jour en UTC.
const jourOuNul = z.string().trim().nullable().optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(v) && Number.isFinite(new Date(v).getTime()), "Date invalide.")
  .transform((v) => (v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null));

export const nouvelleDemande = z.object({
  organisationId: identifiant,
  type: z.nativeEnum(CrmTypeDemande),
  destinataireId: identifiant,
  echeanceLe: jourOuNul,
  precisions: texteOptionnel(1000),
  centreProduitId: identifiant.nullable().optional(),
  etapeIntegrationId: identifiant.nullable().optional(),
}).strict();

export const operationDemande = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("faite"), reponse: texteOptionnel(1000) }).strict(),
  z.object({ operation: z.literal("annuler") }).strict(),
]);

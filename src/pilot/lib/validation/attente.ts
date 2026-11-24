import { z } from "zod";
import { CrmTiers } from "@prisma/client";
import { dateValide } from "./commun";

export const operationAttente = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("declarer"), enAttenteDe: z.nativeEnum(CrmTiers), demandeeLe: dateValide.optional(), echeanceLe: dateValide.nullable().optional() }).strict(),
  z.object({ operation: z.literal("relancer") }).strict(),
  z.object({ operation: z.literal("lever") }).strict(),
]);

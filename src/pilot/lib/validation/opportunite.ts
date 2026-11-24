import { CrmCategoriePrevision } from "@prisma/client";
import { z } from "zod";
import { dateValide, identifiant, texteOptionnel } from "./commun";

/** Le plafond d'un montant d'opportunité, en centimes : un million d'euros. La saisie rapide d'un prospect le reprend. */
export const MONTANT_OPPORTUNITE_MAXIMUM_CENTIMES = 100_000_000;
const montant = z.number().int().min(0).max(MONTANT_OPPORTUNITE_MAXIMUM_CENTIMES);
const probabilite = z.number().int().min(0).max(100);
const champs = z.object({
  productId: identifiant, libelle: texteOptionnel(500), montantMensuelCentimes: montant, montantMiseEnServiceCentimes: montant,
  demarrageAttenduLe: dateValide.nullable().optional(), categoriePrevision: z.nativeEnum(CrmCategoriePrevision).optional(),
  probabilite: probabilite.optional(),
}).strict();
export const creationOpportunite = champs.extend({ organisationId: identifiant });
export const contenuOpportunite = champs.partial().extend({ revenirALEtape: z.boolean().optional() });
const conclusion = z.object({ issue: z.enum(["gagnee", "perdue"]), raisonPerte: z.string().trim().min(1).max(500).optional() }).strict();
function verifierConclusion(p: z.output<typeof conclusion>, ctx: z.RefinementCtx) {
  if (p.issue === "perdue" && !p.raisonPerte) ctx.addIssue({ code: "custom", path: ["raisonPerte"], message: "La raison de perte est obligatoire." });
}
export const conclusionOpportunite = conclusion.superRefine(verifierConclusion);
export const modificationOpportunite = z.discriminatedUnion("operation", [
  contenuOpportunite.extend({ operation: z.literal("modifier") }),
  conclusion.extend({ operation: z.literal("conclure") }),
]).superRefine((p, ctx) => {
  if (p.operation === "conclure") verifierConclusion(p, ctx);
  else if (p.revenirALEtape && p.probabilite !== undefined) ctx.addIssue({ code: "custom", path: ["probabilite"], message: "Choisissez une probabilité ou le retour à l'étape." });
});

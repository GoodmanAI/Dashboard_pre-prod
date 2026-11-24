import { CrmReconduction, CrmStatutContrat } from "@prisma/client";
import { z } from "zod";
import { dateValide, identifiant, texteOptionnel } from "./commun";
import { coherenceLigne, montantContratCalcule, objetLigne } from "./proposition";

/**
 * Une ligne de contrat est au net (C-39) : offerte, elle est à 0. Offerte mais
 * chiffrée, elle serait comptée dans le chiffre d'affaires. Le prix offert reste
 * sur la ligne de proposition, qui garde son brut.
 */
export const ligneContrat = objetLigne.superRefine((ligne, ctx) => {
  coherenceLigne(ligne, ctx);
  if (ligne.offerte && ligne.montantCentimes !== 0) ctx.addIssue({ code: "custom", path: ["montantCentimes"], message: "Une ligne offerte d'un contrat vaut 0 €. Le prix offert reste sur la proposition." });
  // Une ligne de contrat est au net (C-39) : quantité × prix unitaire, moins sa remise (C-90).
  const attendu = montantContratCalcule(ligne);
  if (attendu !== null && attendu !== ligne.montantCentimes) ctx.addIssue({ code: "custom", path: ["montantCentimes"], message: "Le montant d'une ligne de contrat est la quantité × le prix unitaire, moins sa remise." });
});
// Une modification partielle est revalidée avec la ligne courante dans le service.
export const modificationLigneContrat = objetLigne.partial();
export const contenuContrat = z.object({
  reference: texteOptionnel(200), signeLe: dateValide.nullable().optional(), debuteLe: dateValide.nullable().optional(),
  renouvelleLe: dateValide.nullable().optional(), engagementMois: z.number().int().min(0).max(120).nullable().optional(),
  preavisMois: z.number().int().min(0).max(120).nullable().optional(),
  // C-62 : l'essai précède le début officiel, d'un jour à un an.
  essaiDebuteLe: dateValide.nullable().optional(), essaiJours: z.number().int().min(1).max(365).nullable().optional(),
  reconduction: z.nativeEnum(CrmReconduction).nullable().optional(), conditionsTarifaires: texteOptionnel(2000),
}).strict();
export const creationContrat = contenuContrat.extend({ organisationId: identifiant, lignes: z.array(ligneContrat).max(50, "Un contrat compte 50 lignes au plus.") });
export const statutContrat = z.object({ vers: z.nativeEnum(CrmStatutContrat), le: dateValide.optional() }).strict();
export const modificationContrat = z.discriminatedUnion("operation", [
  contenuContrat.extend({ operation: z.literal("modifier") }),
  statutContrat.extend({ operation: z.literal("statut") }),
]);

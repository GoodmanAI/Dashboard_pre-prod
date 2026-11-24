import { CrmTypeEchange, CrmTiers } from "@prisma/client";
import { z } from "zod";
import { dateValide, identifiant } from "./commun";
import { MESSAGE_NIR, ressembleAUnNir } from "./commentaire";

/** Un texte libre d'échange : même garde que les commentaires, jamais de numéro de sécurité sociale (C-86). */
const texteLibre = (max: number) => z.string().trim().max(max).refine((t) => !ressembleAUnNir(t), MESSAGE_NIR);

function verifierJalon(p: { type: string; aLaChargeDe?: string | null; compteRendu?: string | null }, ctx: z.RefinementCtx) {
  if (p.type === "JALON") {
    if (p.aLaChargeDe !== "LYRAE" && p.aLaChargeDe !== "CLIENT") ctx.addIssue({ code: "custom", path: ["aLaChargeDe"], message: "Une étape clé est à la charge de Lyrae ou du client." });
    if (!p.compteRendu?.trim()) ctx.addIssue({ code: "custom", path: ["compteRendu"], message: "Indiquez le nom de l'étape clé." });
  } else if (p.aLaChargeDe != null) ctx.addIssue({ code: "custom", path: ["aLaChargeDe"], message: "Ce champ est réservé aux étapes clés." });
}
/**
 * Une prochaine action se date (C-92) : sans date, l'outil l'aurait acceptée,
 * puis alerté « sans prochaine action ». Une date seule ne dit rien à faire.
 */
export const MESSAGE_ACTION_SANS_DATE = "Indiquez la date de la prochaine action.";
export const MESSAGE_DATE_SANS_ACTION = "Dites quelle est la prochaine action, ou effacez sa date.";
export function verifierProchaineAction(p: { prochaineAction?: string | null; prochaineActionLe?: Date | null }, ctx: z.RefinementCtx) {
  const texte = !!p.prochaineAction?.trim();
  if (texte && !p.prochaineActionLe) ctx.addIssue({ code: "custom", path: ["prochaineActionLe"], message: MESSAGE_ACTION_SANS_DATE });
  if (!texte && p.prochaineActionLe) ctx.addIssue({ code: "custom", path: ["prochaineAction"], message: MESSAGE_DATE_SANS_ACTION });
}
export const saisieEchange = z.object({
  organisationId: identifiant,
  type: z.nativeEnum(CrmTypeEchange),
  aLaChargeDe: z.nativeEnum(CrmTiers).nullable().optional(),
  statut: z.enum(["REALISE", "PLANIFIE"]).default("REALISE"),
  surveneuLe: dateValide,
  contactId: identifiant.nullable().optional(),
  compteRendu: texteLibre(5000).nullable().optional(),
  prochaineAction: texteLibre(500).nullable().optional(),
  prochaineActionLe: dateValide.nullable().optional(),
}).strict().superRefine((p, ctx) => { verifierJalon(p, ctx); verifierProchaineAction(p, ctx); });

const champsSuite = z.object({
  type: z.nativeEnum(CrmTypeEchange),
  aLaChargeDe: z.nativeEnum(CrmTiers).nullable().optional(),
  compteRendu: texteLibre(5000).nullable().optional(),
  prochaineAction: texteLibre(500).nullable().optional(),
  prochaineActionLe: dateValide.nullable().optional(),
}).strict();
export const suiteAction = champsSuite.superRefine((p, ctx) => { verifierJalon(p, ctx); verifierProchaineAction(p, ctx); });
export const modificationEchange = z.discriminatedUnion("operation", [
  champsSuite.omit({ type: true, aLaChargeDe: true }).extend({ operation: z.literal("realiser") }),
  z.object({ operation: z.literal("annuler") }).strict(),
  z.object({ operation: z.literal("replanifier"), le: dateValide }).strict(),
  // Corriger le texte d'un échange déjà noté : son auteur ou le super-administrateur (C-86).
  z.object({ operation: z.literal("corriger"), compteRendu: texteLibre(5000).nullable() }).strict(),
]).superRefine((p, ctx) => { if (p.operation === "realiser") verifierProchaineAction(p, ctx); });
export const modificationProchaineAction = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("faite"), suite: suiteAction.optional() }).strict(),
  z.object({ operation: z.literal("replanifier"), le: dateValide }).strict(),
]);

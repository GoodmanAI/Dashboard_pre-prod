import { CrmBaseTarif } from "@prisma/client";
import { z } from "zod";
import { ROLES_TARIF, refusRole, roleDuCode, type RoleTarif } from "@/pilot/lib/tarifs/roles";
import { auMoinsUnChamp, dateValide, identifiant, texteOptionnel } from "./commun";

/**
 * Les grilles tarifaires et leurs tarifs (lot S). Les montants sont des centimes
 * entiers hors taxe, un taux est un pour-mille entier. `notes` est du texte
 * libre : en base, jamais dans le journal (C-27). `majLe` est la version de la
 * grille lue par l'écran : si elle a changé, le serveur répond 409 (C-26).
 *
 * Un tarif s'ajoute par son **rôle** (src/lib/tarifs/roles.ts), jamais par un
 * code : le serveur tire le code du rôle, et refuse un type ou une base qui ne
 * conviennent pas au rôle (un abonnement Talk est un abonnement, le connecteur
 * RIS un pourcentage, une installation se facture une fois).
 */

export const DATE_INVALIDE = "Date invalide.";
export const TAUX_MANQUANT = "Indiquez le taux du pourcentage, en pour-mille (150 pour 15 %).";
export const MONTANT_AVEC_POURCENTAGE = "Un pourcentage n'a pas de montant : indiquez seulement le taux.";
export const TAUX_SANS_POURCENTAGE = "Le taux est réservé à la base en pourcentage.";

/** Ce que le tarif d'une grille peut être. La part à l'usage se chiffre sur la proposition (unité, volume inclus). */
const TYPES_TARIF = ["ABONNEMENT", "MISE_EN_SERVICE", "PRESTATION"] as const;

/** Un jour « AAAA-MM-JJ », entre 2000 et 2100 : minuit UTC, comme la contrainte de la base. Pas d'heure. */
export const jourGrille = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, DATE_INVALIDE).pipe(dateValide)
  .refine((d) => +d >= Date.UTC(2000, 0, 1) && +d <= Date.UTC(2100, 11, 31), DATE_INVALIDE);

export const creationGrille = z.object({
  applicableLe: jourGrille, notes: texteOptionnel(2000),
  /** Une grille existante dont on reprend les tarifs : le chemin normal pour changer un prix. */
  copierDe: identifiant.optional(),
}).strict();

export const modificationGrille = z.object({ majLe: dateValide, applicableLe: jourGrille.optional(), notes: texteOptionnel(2000) }).strict()
  .refine(({ majLe, ...champs }) => { void majLe; return auMoinsUnChamp(champs); }, "Renseignez au moins un champ.");

const montant = z.number().int().min(0).max(100_000_000).nullable().optional();
const champsTarif = {
  libelle: z.string().trim().min(1).max(120),
  productId: identifiant.nullable().optional(),
  type: z.enum(TYPES_TARIF),
  base: z.nativeEnum(CrmBaseTarif),
  /** Vide : « Prix à renseigner ». Jamais 0 € par défaut. */
  montantHtCentimes: montant,
  pourMille: z.number().int().min(0).max(1000).nullable().optional(),
  ordre: z.number().int().min(0).max(10000).optional(),
};
const objetTarif = z.object(champsTarif);
/** Un code tel que la base l'accepte : celui d'un tarif déjà enregistré, jamais saisi. */
const code = z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(40);

/** Une règle qui parle d'elle-même : le refus affiché la reprend telle quelle. */
const clair = (ctx: z.RefinementCtx, champ: string, message: string) => ctx.addIssue({ code: "custom", path: [champ], message, params: { clair: true } });

/** Un pourcentage a un taux et pas de montant ; une autre base n'a pas de taux (la CHECK de la base le garde aussi). */
function coherence(t: { base: CrmBaseTarif; montantHtCentimes?: number | null; pourMille?: number | null }, ctx: z.RefinementCtx) {
  if (t.base === "POURCENTAGE") {
    if (t.pourMille == null) clair(ctx, "pourMille", TAUX_MANQUANT);
    if (t.montantHtCentimes != null) clair(ctx, "montantHtCentimes", MONTANT_AVEC_POURCENTAGE);
  } else if (t.pourMille != null) clair(ctx, "pourMille", TAUX_SANS_POURCENTAGE);
}

/** Le type et la base attendus du rôle : 400 sinon, avec la règle. */
function selonRole(role: RoleTarif, t: { type: (typeof TYPES_TARIF)[number]; base: CrmBaseTarif }, ctx: z.RefinementCtx) {
  const refus = refusRole(role, t);
  if (refus) clair(ctx, refus.champ, refus.message);
}

/** Un tarif entier, avec son code : ce que le service revalide après avoir fusionné une modification partielle. Le rôle se lit dans le code. */
export const tarifComplet = objetTarif.extend({ code }).strict().superRefine((t, ctx) => { coherence(t, ctx); selonRole(roleDuCode(t.code), t, ctx); });
/** Ajouter un tarif : son rôle, jamais son code (le serveur le tire du rôle). */
export const creationTarif = objetTarif.extend({ role: z.enum(ROLES_TARIF), majLe: dateValide }).strict()
  .superRefine((t, ctx) => { coherence(t, ctx); selonRole(t.role, t, ctx); });
/** Le code et le rôle sont stables : ils ne changent pas. Chaque champ se valide seul ici, la cohérence sur le tarif entier. */
export const modificationTarif = objetTarif.partial().extend({ majLe: dateValide }).strict()
  .refine(({ majLe, ...champs }) => { void majLe; return auMoinsUnChamp(champs); }, "Renseignez au moins un champ.");
export const suppressionTarif = z.object({ majLe: dateValide }).strict();
/** Supprimer une grille à venir que rien n'utilise : la version lue. */
export const suppressionGrille = suppressionTarif;

const MESSAGES_CLAIRS = new Set([DATE_INVALIDE, TAUX_MANQUANT, MONTANT_AVEC_POURCENTAGE, TAUX_SANS_POURCENTAGE, "Renseignez au moins un champ."]);
const LIBELLES_CHAMPS: Record<string, string> = {
  majLe: "Version lue", applicableLe: "Date d'application", notes: "Notes (2 000 caractères au plus)", copierDe: "Grille à copier",
  code: "Code", role: "Rôle", libelle: "Libellé", productId: "Produit", type: "Type", base: "Base", montantHtCentimes: "Prix hors taxe en euros",
  pourMille: "Taux en pour-mille", ordre: "Ordre",
};

/** Le refus à afficher : la règle qui parle d'elle-même, sinon le champ à corriger. */
export function messageTarif(erreur: z.ZodError): string {
  const premier = erreur.issues[0];
  if (premier && (MESSAGES_CLAIRS.has(premier.message) || (premier.code === "custom" && premier.params?.clair === true))) return premier.message;
  const libelle = LIBELLES_CHAMPS[String(premier?.path.at(-1) ?? "")];
  return libelle ? `Vérifiez le champ « ${libelle} ».` : "Corps de requête invalide.";
}

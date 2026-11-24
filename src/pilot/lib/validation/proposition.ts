import { CrmBaseTarif, CrmStatutProposition, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { brutCalcule, montantContratCalcule } from "@/pilot/lib/propositions/regles";
import { z } from "zod";
import { dateValide, identifiant, texteOptionnel } from "./commun";

/** Les champs d'une ligne, avant les règles croisées : le contrat en tire sa modification partielle. */
export const objetLigne = z.object({
  // Facultatif depuis le lot S (prestation, connecteur RIS) : sans produit, le libellé est obligatoire.
  productId: identifiant.nullable().optional(), centreId: identifiant.nullable().optional(), type: z.nativeEnum(CrmTypeLigne),
  montantCentimes: z.number().int().min(0).max(100000000),
  unite: z.nativeEnum(CrmUniteVariable).nullable().optional(),
  volumeInclus: z.number().int().min(0).max(2147483647).nullable().optional(), libelle: texteOptionnel(500),
  /** Geste commercial (lot S) : la ligne est offerte au client. */
  offerte: z.boolean().optional(),
  /** Le calcul de la ligne (C-90) : 3 salles × 290 €, et sa remise propre en pour-mille. */
  quantite: z.number().int().min(1).max(100000).nullable().optional(),
  prixUnitaireCentimes: z.number().int().min(0).max(100000000).nullable().optional(),
  baseQuantite: z.nativeEnum(CrmBaseTarif).nullable().optional(),
  remisePourMille: z.number().int().min(0).max(1000).nullable().optional(),
}).strict();
/** Les règles communes aux lignes de proposition et de contrat. */
export function coherenceLigne(ligne: z.output<typeof objetLigne>, ctx: z.RefinementCtx) {
  // Quantité et prix unitaire vont ensemble (C-90) ; la base dit ce qu'on compte, jamais un pourcentage.
  if ((ligne.quantite == null) !== (ligne.prixUnitaireCentimes == null)) ctx.addIssue({ code: "custom", path: ["quantite"], message: "Indiquez la quantité et le prix unitaire, ou aucun des deux." });
  if (ligne.baseQuantite != null && (ligne.quantite == null || ligne.baseQuantite === "POURCENTAGE")) ctx.addIssue({ code: "custom", path: ["baseQuantite"], message: "La base accompagne une quantité : par salle, par site ou par organisation." });
  if (ligne.type === "PART_VARIABLE" && ligne.quantite != null) ctx.addIssue({ code: "custom", path: ["quantite"], message: "La part variable a déjà un prix unitaire : pas de quantité." });
  if (ligne.productId == null && !ligne.libelle) ctx.addIssue({ code: "custom", path: ["libelle"], message: "Donnez un libellé à une ligne sans produit." });
  if (ligne.type === "PART_VARIABLE" && !ligne.unite) ctx.addIssue({ code: "custom", path: ["unite"], message: "Choisissez l'unité de la part variable." });
  if (ligne.type !== "PART_VARIABLE") {
    if (ligne.unite != null) ctx.addIssue({ code: "custom", path: ["unite"], message: "L'unité est réservée à la part variable." });
    if (ligne.volumeInclus != null) ctx.addIssue({ code: "custom", path: ["volumeInclus"], message: "Le volume inclus est réservé à la part variable." });
  }
}
/**
 * Une ligne de proposition offerte garde son montant brut (c'est le geste
 * affiché, jamais un montant négatif). Elle peut valoir 0 : un geste sans
 * valeur affichée (« Formation incluse »). L'écran invite à indiquer le prix
 * quand on le connaît (`conseilLigne`, propositions/saisie.ts), sans l'exiger.
 * Le contrat, lui, est au net : sa ligne offerte est à 0 (validation/contrat.ts).
 */
export const ligneProposition = objetLigne.superRefine((ligne, ctx) => {
  coherenceLigne(ligne, ctx);
  // Le brut d'une ligne de proposition est quantité × prix unitaire (C-90) : l'écran le calcule, le serveur le vérifie.
  const brut = brutCalcule(ligne);
  if (brut !== null && brut !== ligne.montantCentimes) ctx.addIssue({ code: "custom", path: ["montantCentimes"], message: "Le montant d'une ligne est la quantité × le prix unitaire." });
});
export { montantContratCalcule };
export const documentProposition = z.string().trim().url().refine((v) => { try { return v.startsWith("https://") && new URL(v).protocol === "https:"; } catch { return false; } }, "Le document demande un lien https.").nullable().optional();
/** `preremplir` : les lignes viennent de la grille tarifaire en vigueur (lot S). Sans lui, la version se crée vide ou reprend la précédente. */
export const creationVersion = z.object({ organisationId: identifiant, preremplir: z.boolean().optional() }).strict();
/** Repréremplir un brouillon depuis la grille en vigueur (lot S) : la version lue, 409 si elle a changé. */
export const preremplissageVersion = z.object({ majLe: dateValide }).strict();
const champsContenu = z.object({
  lignes: z.array(ligneProposition).max(50, "Une proposition compte 50 lignes au plus.").optional(), remisePourMille: z.number().int().min(0).max(1000).optional(),
  engagementMois: z.number().int().min(0).max(120).nullable().optional(), preavisMois: z.number().int().min(0).max(120).nullable().optional(),
  valideJusquAu: dateValide.nullable().optional(), documentUrl: documentProposition,
  reponseClient: texteOptionnel(5000), notes: texteOptionnel(5000),
  /** La version lue par l'écran (lot S) : obligatoire avec des lignes, 409 si elle a changé. */
  majLe: dateValide.optional(),
}).strict();
/**
 * Des lignes ne partent jamais sans la version lue : un préremplissage fait
 * dans un autre onglet (ou un autre écran) ne s'écrase pas en silence.
 */
function versionLueAvecLignes(d: { lignes?: unknown; majLe?: Date }, ctx: z.RefinementCtx) {
  if (d.lignes !== undefined && d.majLe === undefined) ctx.addIssue({ code: "custom", path: ["majLe"], message: "La version lue accompagne les lignes." });
}
export const contenuProposition = champsContenu.superRefine(versionLueAvecLignes);
export const statutProposition = z.object({
  vers: z.nativeEnum(CrmStatutProposition), valideJusquAu: dateValide.optional(), documentUrl: documentProposition,
  reponseClient: texteOptionnel(5000),
}).strict();
export const modificationProposition = z.discriminatedUnion("operation", [
  champsContenu.extend({ operation: z.literal("modifier") }),
  statutProposition.extend({ operation: z.literal("statut") }),
]).superRefine((d, ctx) => { if (d.operation === "modifier") versionLueAvecLignes(d, ctx); });
export const acceptationProposition = z.object({ debuteLe: dateValide.nullable().optional(), remplaceContratIds: z.array(identifiant).optional() }).strict();

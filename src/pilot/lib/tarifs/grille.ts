import type { CrmBaseTarif, CrmTypeLigne, Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

/**
 * La grille de prix en vigueur, sous une forme neutre (CHOIX.md, C-70, lot S).
 *
 * Elle vient de `CrmGrilleTarifaire` : la grille dont la date d'application est
 * la plus récente sans dépasser l'instant demandé, calculée à la lecture (C-08).
 * `lireGrilleEnVigueur` est le seul accès. Tous les montants sont hors taxe, en
 * centimes entiers ; un taux est en pour-mille entier.
 */
export type ProduitTarif = "TALK" | "KONNECT";

/** Un tarif de la grille. `montantHtCentimes` null : « Prix à renseigner », jamais 0 €. */
export type TarifGrille = {
  code: string;
  libelle: string;
  /** Produit du catalogue ; null pour le connecteur RIS, ou si le produit a disparu. */
  productId: number | null;
  type: CrmTypeLigne;
  base: CrmBaseTarif;
  montantHtCentimes: number | null;
  /** Base POURCENTAGE seulement : 150 = 15 %. */
  pourMille: number | null;
};

export type GrilleEnVigueur = {
  /** Identifiant de la grille, null s'il n'existe aucune grille en vigueur. */
  id: number | null;
  /** Jour d'application, « AAAA-MM-JJ » (minuit UTC), null sans grille. */
  applicableLe: string | null;
  /** Les tarifs, dans l'ordre de la grille. */
  tarifs: TarifGrille[];
  /**
   * Vue simple, pour l'estimation d'un prospect (`estimerMontant`) : l'abonnement
   * par salle de Talk et de Konnect. Un produit absent, sans montant ou dont la
   * base n'est pas la salle n'a pas de prix connu ici.
   */
  prix: Partial<Record<ProduitTarif, { base: "PAR_SALLE"; montantHtCentimes: number }>>;
  /** Connecteur RIS : part du montant des salles, en points de base (15 % = 1500). Null si inconnu. */
  connecteurRisPdm: number | null;
};

export const GRILLE_VIDE: GrilleEnVigueur = { id: null, applicableLe: null, tarifs: [], prix: {}, connecteurRisPdm: null };

/** Le tarif d'un code, s'il existe. */
export const tarifDe = (g: Pick<GrilleEnVigueur, "tarifs">, code: string) => g.tarifs.find((t) => t.code === code) ?? null;

/** La grille neutre depuis une grille de la base et ses tarifs. Pure. */
export function grilleDepuisTarifs(entete: { id: number; applicableLe: Date } | null, tarifs: TarifGrille[]): GrilleEnVigueur {
  if (!entete) return GRILLE_VIDE;
  const g = { tarifs };
  const prix: GrilleEnVigueur["prix"] = {};
  for (const produit of ["TALK", "KONNECT"] as const) {
    const t = tarifDe(g, produit);
    if (t && t.base === "PAR_SALLE" && t.montantHtCentimes != null) prix[produit] = { base: "PAR_SALLE", montantHtCentimes: t.montantHtCentimes };
  }
  const ris = tarifDe(g, "CONNECTEUR_RIS");
  return {
    id: entete.id,
    applicableLe: entete.applicableLe.toISOString().slice(0, 10),
    tarifs,
    prix,
    // Le pour-mille de la grille en points de base, l'unité de l'apport (C-63) : × 10, exact.
    connecteurRisPdm: ris && ris.base === "POURCENTAGE" && ris.pourMille != null ? ris.pourMille * 10 : null,
  };
}

export const selectionTarif = {
  code: true, libelle: true, productId: true, type: true, base: true, montantHtCentimes: true, pourMille: true,
} satisfies Prisma.CrmTarifSelect;

/**
 * L'unique accès à la grille : une lecture, la grille et ses tarifs. Le client
 * est celui d'une page ou d'une transaction. Sans grille en vigueur (base neuve
 * avant le SQL du lot S), une grille vide : jamais un prix inventé.
 */
export async function lireGrilleEnVigueur(client: Prisma.TransactionClient | typeof prisma = prisma, maintenant: Date = new Date()): Promise<GrilleEnVigueur> {
  const g = await client.crmGrilleTarifaire.findFirst({
    where: { applicableLe: { lte: maintenant } },
    orderBy: { applicableLe: "desc" },
    select: { id: true, applicableLe: true, tarifs: { select: selectionTarif, orderBy: [{ ordre: "asc" }, { id: "asc" }] } },
  });
  return g ? grilleDepuisTarifs(g, g.tarifs) : GRILLE_VIDE;
}

/**
 * Le seul jour d'application de la grille en vigueur (« AAAA-MM-JJ »), ou null :
 * ce que la fiche d'une organisation affiche sur le bouton du préremplissage.
 * Une lecture d'une colonne, sans les tarifs.
 */
export async function lireDateGrilleEnVigueur(client: Prisma.TransactionClient | typeof prisma = prisma, maintenant: Date = new Date()): Promise<string | null> {
  const g = await client.crmGrilleTarifaire.findFirst({ where: { applicableLe: { lte: maintenant } }, orderBy: { applicableLe: "desc" }, select: { applicableLe: true } });
  return g ? g.applicableLe.toISOString().slice(0, 10) : null;
}

/** Ce que l'estimation d'un prospect lit de la grille (`estimerMontant`) : les prix par salle et le connecteur, rien d'autre. */
export type GrilleEstimation = Pick<GrilleEnVigueur, "prix" | "connecteurRisPdm">;
export const grillePourEstimation = ({ prix, connecteurRisPdm }: GrilleEnVigueur): GrilleEstimation => ({ prix, connecteurRisPdm });

/**
 * Une grille précise, par identifiant (le préremplissage la lit après l'avoir
 * verrouillée, la page Tarifs la lit pour la copier). Null si elle n'existe pas.
 */
export async function lireGrilleParId(client: Prisma.TransactionClient | typeof prisma, id: number): Promise<GrilleEnVigueur | null> {
  const g = await client.crmGrilleTarifaire.findUnique({
    where: { id },
    select: { id: true, applicableLe: true, tarifs: { select: selectionTarif, orderBy: [{ ordre: "asc" }, { id: "asc" }] } },
  });
  return g ? grilleDepuisTarifs(g, g.tarifs) : null;
}

/**
 * La grille en vigueur, verrouillée en partage (`FOR SHARE`) le temps de la
 * transaction : une écriture de tarif (`FOR UPDATE`, src/lib/tarifs/gerer.ts)
 * attend la fin de la version qui s'en sert, et une version qui se crée attend
 * la fin d'une écriture en cours. Les tarifs sont lus une fois le verrou pris,
 * donc ceux que la version fige sont bien ceux qui restent (la grille devient
 * « utilisée » avec la version, et ne change plus).
 */
export async function lireGrilleEnVigueurVerrouillee(tx: Prisma.TransactionClient, maintenant: Date = new Date()): Promise<GrilleEnVigueur> {
  const courante = await tx.crmGrilleTarifaire.findFirst({ where: { applicableLe: { lte: maintenant } }, orderBy: { applicableLe: "desc" }, select: { id: true } });
  if (!courante) return GRILLE_VIDE;
  await tx.$queryRaw`SELECT id FROM "CrmGrilleTarifaire" WHERE id = ${courante.id} FOR SHARE`;
  return (await lireGrilleParId(tx, courante.id)) ?? GRILLE_VIDE;
}

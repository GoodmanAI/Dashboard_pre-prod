import type { CrmBaseTarif, CrmTypeLigne, Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { classerGrilles, resumerGrille, type StatutGrille } from "./regles";

/**
 * La lecture des grilles pour la page Tarifs et les routes (lot S). Le statut
 * (en vigueur, passée, à venir) et le nombre de propositions qui s'en servent
 * sont calculés à la lecture, jamais stockés (C-08). Un nombre fixe de
 * requêtes, quel que soit le nombre de grilles : les grilles avec leurs tarifs,
 * puis le décompte des propositions par grille.
 */

export type TarifLu = {
  id: number; code: string; libelle: string; productId: number | null; type: CrmTypeLigne; base: CrmBaseTarif;
  /** Null : « Prix à renseigner ». */
  montantHtCentimes: number | null;
  /** Base POURCENTAGE seulement : 150 = 15 %. */
  pourMille: number | null;
  ordre: number;
};

export type GrilleLue = {
  id: number;
  /** « AAAA-MM-JJ », minuit UTC. */
  applicableLe: string;
  notes: string | null;
  creeLe: Date;
  /** La version lue : à renvoyer à chaque écriture (409 si elle a changé). */
  majLe: Date;
  statut: StatutGrille;
  nombrePropositions: number;
  /** Aucune proposition ne s'en sert : ses tarifs, ses notes et sa date (si elle est à venir) se modifient. */
  modifiable: boolean;
  /** La phrase qui dit pourquoi elle ne se modifie plus, sinon null. */
  raison: string | null;
  dateModifiable: boolean;
  /** À venir et inutilisée : elle se supprime. */
  supprimable: boolean;
  tarifs: TarifLu[];
};

const SELECTION = {
  id: true, applicableLe: true, notes: true, creeLe: true, majLe: true,
  tarifs: {
    select: { id: true, code: true, libelle: true, productId: true, type: true, base: true, montantHtCentimes: true, pourMille: true, ordre: true },
    orderBy: [{ ordre: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.CrmGrilleTarifaireSelect;

type Client = Prisma.TransactionClient | typeof prisma;

/** Toutes les grilles, de la plus lointaine à la plus ancienne, avec leurs tarifs et leur usage. */
export async function listerGrilles(client: Client = prisma, maintenant: Date = new Date()): Promise<GrilleLue[]> {
  const grilles = await client.crmGrilleTarifaire.findMany({ select: SELECTION });
  const usages = await client.crmProposition.groupBy({ by: ["grilleId"], where: { grilleId: { not: null } }, _count: { _all: true } });
  const parGrille = new Map(usages.map((u) => [u.grilleId, u._count._all]));
  return classerGrilles(grilles, maintenant).map(({ statut, ...g }) => ({
    ...g, applicableLe: g.applicableLe.toISOString().slice(0, 10), ...resumerGrille(statut, parGrille.get(g.id) ?? 0),
  }));
}

/** Une grille, lue comme dans la liste. Null si elle n'existe pas. */
export async function lireGrille(client: Client, id: number, maintenant: Date = new Date()): Promise<GrilleLue | null> {
  const grilles = await listerGrilles(client, maintenant);
  return grilles.find((g) => g.id === id) ?? null;
}

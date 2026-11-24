import type { CrmEchange, CrmEvenement } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

type Auteur = { name: string | null } | null;
export type EchangeChronologique = Pick<CrmEchange,
  "id" | "type" | "statut" | "surveneuLe" | "compteRendu" | "prochaineAction" | "prochaineActionLe" | "prochaineActionFaiteLe"
> & { contact: { nom: string } | null; auteur: Auteur; auteurId?: number | null };
export type EvenementChronologique = Pick<CrmEvenement,
  "id" | "type" | "surveneuLe" | "resume" | "auteurId"
> & { auteur: Auteur };

export type ElementChronologie =
  | { nature: "echange"; id: number; type: CrmEchange["type"]; surveneuLe: string;
      compteRendu: string | null; prochaineAction: string | null; prochaineActionLe: string | null;
      statut: CrmEchange["statut"]; prochaineActionFaiteLe: string | null;
      contact: string | null; auteur: string | null; auteurId: number | null }
  | { nature: "evenement"; id: number; type: CrmEvenement["type"]; surveneuLe: string;
      resume: string; auteurId: number | null; auteur: string | null };

export type PageChronologie = {
  elements: ElementChronologie[];
  suite: boolean;
  curseur: string | null;
};

/**
 * Ordre total de la chronologie : date décroissante, puis l'échange avant
 * l'événement, puis id décroissant. Le curseur porte les trois, sinon deux
 * échanges datés du même jour (donc du même minuit) se perdraient entre deux
 * pages.
 */
const RANG = { echange: 0, evenement: 1 } as const;
export type Curseur = { surveneuLe: Date; nature: keyof typeof RANG; id: number };

export function ecrireCurseur(e: Pick<ElementChronologie, "surveneuLe" | "nature" | "id">): string {
  return `${e.surveneuLe}~${e.nature}~${e.id}`;
}

export function lireCurseur(texte: string): Curseur | null {
  const [date, nature, id] = texte.split("~");
  const surveneuLe = new Date(date ?? "");
  const n = Number(id);
  if (!date || Number.isNaN(surveneuLe.getTime())) return null;
  if (nature !== "echange" && nature !== "evenement") return null;
  if (!Number.isInteger(n) || n <= 0) return null;
  return { surveneuLe, nature, id: n };
}

/** Ce qui vient strictement après le curseur, pour chacune des deux tables. */
export function filtresApres(c: Curseur) {
  const avant = { surveneuLe: { lt: c.surveneuLe } };
  const memeInstantPlusAncien = { surveneuLe: c.surveneuLe, id: { lt: c.id } };
  return {
    echanges: c.nature === "echange" ? { OR: [avant, memeInstantPlusAncien] } : avant,
    evenements: c.nature === "echange"
      ? { surveneuLe: { lte: c.surveneuLe } }
      : { OR: [avant, memeInstantPlusAncien] },
  };
}

/**
 * Les événements que la chronologie ne montre pas : l'échange est déjà présent
 * (ses événements de saisie et de modification feraient doublon), et le fil des
 * commentaires montre déjà chaque commentaire écrit (lot T). La suppression d'un
 * commentaire reste visible : elle garde la trace, sans le texte.
 */
export const TYPES_MASQUES: CrmEvenement["type"][] = ["ECHANGE_SAISI", "ECHANGE_MODIFIE", "COMMENTAIRE_ECRIT"];

export function fusionnerChronologie(
  echanges: EchangeChronologique[],
  evenements: EvenementChronologique[],
  limite: number,
): PageChronologie {
  const fusion: ElementChronologie[] = [
    ...echanges.map((e): ElementChronologie => ({
      nature: "echange", id: e.id, type: e.type, surveneuLe: e.surveneuLe.toISOString(),
      statut: e.statut, prochaineActionFaiteLe: e.prochaineActionFaiteLe?.toISOString() ?? null,
      compteRendu: e.compteRendu, prochaineAction: e.prochaineAction,
      prochaineActionLe: e.prochaineActionLe?.toISOString() ?? null,
      contact: e.contact?.nom ?? null, auteur: e.auteur?.name ?? null, auteurId: e.auteurId ?? null,
    })),
    ...evenements.filter((e) => !TYPES_MASQUES.includes(e.type))
      .map((e): ElementChronologie => ({
        nature: "evenement", id: e.id, type: e.type, surveneuLe: e.surveneuLe.toISOString(),
        resume: e.resume, auteurId: e.auteurId, auteur: e.auteur?.name ?? null,
      })),
  ];
  fusion.sort((a, b) =>
    Date.parse(b.surveneuLe) - Date.parse(a.surveneuLe)
    || RANG[a.nature] - RANG[b.nature]
    || b.id - a.id);
  const elements = fusion.slice(0, limite);
  const dernier = elements.at(-1);
  const suite = fusion.length > limite;
  return { elements, suite, curseur: suite && dernier ? ecrireCurseur(dernier) : null };
}

/**
 * Cinq requêtes au plus, quelle que soit la taille de l'historique : événements
 * et leurs auteurs, échanges, leurs contacts et leurs auteurs. Chaque liste est
 * bornée à `limite + 1` pour savoir s'il reste une suite.
 */
export async function chronologie(
  organisationId: number,
  { apres, limite = 50 }: { apres?: Curseur; limite?: number } = {},
): Promise<PageChronologie> {
  const filtres = apres ? filtresApres(apres) : null;
  const [evenements, echanges] = await Promise.all([
    prisma.crmEvenement.findMany({
      where: {
        organisationId,
        ...filtres?.evenements,
        // Exclure aussi en base évite qu'une page d'audit masque l'historique visible.
        type: { notIn: TYPES_MASQUES },
      },
      select: { id: true, type: true, surveneuLe: true, resume: true, auteurId: true, auteur: { select: { name: true } } },
      orderBy: [{ surveneuLe: "desc" }, { id: "desc" }],
      take: limite + 1,
    }),
    prisma.crmEchange.findMany({
      where: { organisationId, ...filtres?.echanges },
      select: {
        id: true, type: true, surveneuLe: true, compteRendu: true, auteurId: true,
        prochaineAction: true, prochaineActionLe: true,
        statut: true, prochaineActionFaiteLe: true,
        contact: { select: { nom: true } }, auteur: { select: { name: true } },
      },
      orderBy: [{ surveneuLe: "desc" }, { id: "desc" }],
      take: limite + 1,
    }),
  ]);
  return fusionnerChronologie(echanges, evenements, limite);
}

export async function nouveautes({
  depuis, organisationIds, utilisateurId, avant, limite = 50,
}: { depuis: Date; organisationIds?: number[]; utilisateurId?: number; avant?: Curseur; limite?: number }) {
  return prisma.crmEvenement.findMany({
    where: { surveneuLe: { gt: depuis }, organisationId: organisationIds ? { in: organisationIds } : undefined,
      ...(avant ? { AND: [filtresApres(avant).evenements] } : {}),
      ...(utilisateurId === undefined ? {} : {
        organisation: { OR: [{ responsableId: utilisateurId }, { chefDeProjetId: utilisateurId }] },
        OR: [{ auteurId: null }, { auteurId: { not: utilisateurId } }],
      }),
    },
    select: { id: true, type: true, organisationId: true, resume: true, surveneuLe: true, auteurId: true, auteur: { select: { name: true } } },
    orderBy: [{ surveneuLe: "desc" }, { id: "desc" }],
    take: limite,
  });
}

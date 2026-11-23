import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { compterUsage } from "./compteurs";
import { decalerMois } from "./projeter";
import type { ContratReel, RattachementReel } from "./reel";

/**
 * Les entrées de `reelDuMois` pour un mois, en lectures groupées de nombre
 * constant : contrats, lignes, rattachements, puis les compteurs par
 * l'adaptateur. Les compteurs courent du 1er du mois à `finCompteurs`, la fin
 * du mois pour un mois figé, l'instant présent pour le mois en cours.
 */
export async function chargerEntreesReel(p: { mois: Date; finCompteurs: Date }) {
  const debut = decalerMois(p.mois, 0);
  const fin = decalerMois(debut, 1);
  // Même filtre que contratCompteLeMois, appliqué en base pour ne lire que le mois.
  const surLeMois: Prisma.CrmContratWhereInput = { statut: { not: "BROUILLON" }, AND: [
    { OR: [{ debuteLe: { lt: fin } }, { debuteLe: null, signeLe: { lt: fin } }] },
    { OR: [{ termineLe: null }, { termineLe: { gte: debut } }] },
  ] };
  const [contrats, lignes, rattachements, formations] = await Promise.all([
    prisma.crmContrat.findMany({ where: surLeMois, orderBy: { id: "asc" },
      select: { id: true, organisationId: true, statut: true, debuteLe: true, signeLe: true, termineLe: true } }),
    prisma.crmLigneContrat.findMany({ where: { contrat: surLeMois }, orderBy: { id: "asc" },
      select: { id: true, contratId: true, productId: true, centreId: true, type: true, montantCentimes: true, unite: true, volumeInclus: true } }),
    // Une jointure Pilot : les relations Prisma feraient un second SELECT.
    prisma.$queryRaw<RattachementReel[]>`SELECT cp."centreId", cp."productId", cp."userProductId", c."organisationId"
      FROM "CrmCentreProduit" cp JOIN "CrmCentre" c ON c.id = cp."centreId"
      WHERE cp."userProductId" IS NOT NULL ORDER BY cp.id`,
    prisma.crmFormationPoc.findMany({ where: { debuteLe: { gte: debut, lt: fin } }, select: { organisationId: true, debuteLe: true, montantCentimes: true } }),
  ]);
  // Une ligne sans produit (lot S) compte comme les autres, sous le produit `0` de la clé : la projection,
  // Ventes et le montant affiché la comptent déjà, le réel aussi.
  const parContrat = new Map<number, typeof lignes>();
  for (const l of lignes) parContrat.set(l.contratId, [...parContrat.get(l.contratId) ?? [], l]);
  const entrees: ContratReel[] = contrats.map((c) => ({ ...c,
    lignes: (parContrat.get(c.id) ?? []).map(({ contratId, ...l }) => { void contratId; return l; }) }));
  // Seuls les accès qui portent une part variable sont comptés.
  const variables = new Set(entrees.flatMap((c) => c.lignes.filter((l) => l.type === "PART_VARIABLE" && l.productId !== null).map((l) => `${c.organisationId}|${l.productId}`)));
  const utiles = rattachements.filter((r) => variables.has(`${r.organisationId}|${r.productId}`));
  const usage = await compterUsage({ debut, fin: p.finCompteurs, userProductIds: utiles.map((r) => r.userProductId) });
  return { mois: debut, contrats: entrees, rattachements: utiles, usage, formations };
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { instantSql } from "@/pilot/lib/datesSql";

/**
 * L'usage d'un centre en production, par un adaptateur (C-04, C-33, comme
 * `ca/compteurs.ts`).
 *
 * La source réelle au Dashboard est la même question ouverte que pour la part
 * variable (ARCHITECTURE §8.9, §12) : `Call`, `CallConversation`, qui coexistent
 * pour un même appel, ou la remontée Konnect. En local, le miroir `Call` fait
 * office de compteur. Le jour où la source est tranchée, seul ce fichier change.
 *
 * Des comptes par semaine, jamais un appel : aucune donnée patient ne sort d'ici.
 */
export type UsageCentre = {
  /** Appels de chaque semaine glissante, la plus ancienne d'abord : [n4, n3, n2, n1]. */
  semaines: [number, number, number, number];
  /** RDV pris et appels sur les 28 jours. */
  rdv: number;
  appels: number;
};

const SEMAINE = 7 * 86400000;

/**
 * Quatre semaines glissantes de 7 jours UTC finissant à `maintenant`, en une
 * requête groupée quel que soit le nombre de centres. Chaque identifiant demandé
 * a son entrée, à zéro sans appel. La semaine 1 couvre ]maintenant - 7 j,
 * maintenant], la semaine 4 ]maintenant - 28 j, maintenant - 21 j].
 */
export async function usageParSemaine({ userProductIds, maintenant }: { userProductIds: number[]; maintenant: Date }): Promise<Map<number, UsageCentre>> {
  const ids = [...new Set(userProductIds)];
  const usage = new Map<number, UsageCentre>(ids.map((id) => [id, { semaines: [0, 0, 0, 0], rdv: 0, appels: 0 }]));
  if (!ids.length) return usage;
  const borne = (n: number) => instantSql(new Date(maintenant.getTime() - n * SEMAINE));
  const groupes = await prisma.$queryRaw<Array<{ userProductId: number; semaine: number; rdvPris: boolean; nombre: number }>>`
    SELECT "userProductId", "rdvPris",
      CASE WHEN "startedAt" > ${borne(1)} THEN 1 WHEN "startedAt" > ${borne(2)} THEN 2 WHEN "startedAt" > ${borne(3)} THEN 3 ELSE 4 END AS semaine,
      count(*)::integer AS nombre
    FROM "Call"
    WHERE "userProductId" IN (${Prisma.join(ids)}) AND "startedAt" > ${borne(4)} AND "startedAt" <= ${borne(0)}
    GROUP BY 1, 2, 3`;
  for (const g of groupes) {
    const u = usage.get(g.userProductId);
    if (!u) continue;
    u.semaines[4 - g.semaine] += g.nombre;
    u.appels += g.nombre;
    if (g.rdvPris) u.rdv += g.nombre;
  }
  return usage;
}

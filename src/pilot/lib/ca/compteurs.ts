import { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { SQL_PATIENT_A_PARLE } from "@/lib/appelsSansParole";

/**
 * Les compteurs de la part variable, par un adaptateur (C-04, C-33).
 *
 * La source réelle au Dashboard est une question ouverte (ARCHITECTURE §8.9,
 * §12) : `Call`, `CallConversation`, qui coexistent pour un même appel, ou la
 * remontée Konnect. Tranché à l'intégration : `CallConversation`. Le jour
 * où la source est tranchée, seul ce fichier change. Rien d'autre dans Pilot ne
 * lit `Call` pour le chiffre d'affaires.
 *
 * Des comptes, jamais un appel : aucune donnée patient ne sort d'ici.
 */
export type Compteurs = { APPEL_TRAITE: number; RDV_PRIS: number; SMS_ENVOYE: number | null };

/**
 * Usage de chaque accès Dashboard sur [debut, fin[, en une requête groupée.
 * Chaque identifiant demandé a son entrée, à zéro sans appel. `SMS_ENVOYE` vaut
 * null : aucun compteur de SMS n'existe en local.
 */
export async function compterUsage(p: { debut: Date; fin: Date; userProductIds: number[] }): Promise<Map<number, Compteurs>> {
  const ids = [...new Set(p.userProductIds)];
  const usage = new Map<number, Compteurs>(ids.map((id) => [id, { APPEL_TRAITE: 0, RDV_PRIS: 0, SMS_ENVOYE: null }]));
  if (!ids.length) return usage;
  // Une CallConversation est un appel (la table Call est retirée du Dashboard depuis le
  // 22/10/2026). Les appels sans aucune parole du patient ne comptent pas, comme dans
  // les statistiques du Dashboard. Un RDV pris : `stats.rdv_booked` non nul.
  const groupes = await prisma.$queryRaw<Array<{ userProductId: number; appels: number; rdv: number }>>`
    SELECT "userProductId", count(*)::integer AS appels,
           count(*) FILTER (WHERE COALESCE("stats"->>'rdv_booked', '0') NOT IN ('0', '', 'false', 'null'))::integer AS rdv
    FROM "CallConversation"
    WHERE "userProductId" IN (${Prisma.join(ids)}) AND "createdAt" >= ${p.debut.toISOString()}::timestamp AND "createdAt" < ${p.fin.toISOString()}::timestamp AND ${SQL_PATIENT_A_PARLE}
    GROUP BY "userProductId"`;
  for (const g of groupes) {
    const compteurs = usage.get(g.userProductId);
    if (!compteurs) continue;
    compteurs.APPEL_TRAITE += g.appels;
    compteurs.RDV_PRIS += g.rdv;
  }
  return usage;
}

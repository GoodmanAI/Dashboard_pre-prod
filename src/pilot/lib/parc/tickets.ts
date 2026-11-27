import { prisma } from "@/pilot/lib/prisma";

/**
 * Les demandes ouvertes de chaque compte client (tickets du Dashboard en attente ou en
 * cours), pour le voyant « incidents » du parc. Branché le 27/11/2026, quand les demandes
 * des clients sont passées dans Pilot (plan lyrae/plans/2026-11-separation-dashboard-pilot.md).
 *
 * Un compte principal compte aussi les demandes de ses sous-comptes. Des nombres
 * seulement : ni titre ni texte ne sort d'ici.
 */
export async function ticketsOuverts(userIds: number[]): Promise<Map<number, number> | null> {
  const ids = [...new Set(userIds)];
  const comptes = new Map<number, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return comptes;
  const ouverts = await prisma.ticket.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, OR: [{ userId: { in: ids } }, { user: { managerId: { in: ids } } }] },
    select: { userId: true, user: { select: { managerId: true } } },
  });
  for (const t of ouverts) {
    const principal = comptes.has(t.userId) ? t.userId : t.user.managerId;
    if (principal !== null && comptes.has(principal)) comptes.set(principal, (comptes.get(principal) ?? 0) + 1);
  }
  return comptes;
}

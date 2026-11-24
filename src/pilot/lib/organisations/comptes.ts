import type { Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";

export async function verifierResponsables(tx: Prisma.TransactionClient, donnees: { responsableId?: number; chefDeProjetId?: number | null }) {
  const ids = [...new Set([donnees.responsableId, donnees.chefDeProjetId].filter((id): id is number => id != null))];
  if (!ids.length) return;
  const nombre = await tx.user.count({ where: { id: { in: ids }, role: { in: ["SUPER_ADMIN", "ADMIN"] } } });
  if (nombre !== ids.length) throw new ErreurMetier("Responsable inconnu.", 400);
}

/** Sérialise les mutations des contacts pour garantir un seul principal. */
export async function verrouillerOrganisation(tx: Prisma.TransactionClient, id: number) {
  const lignes = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmOrganisation" WHERE id = ${id} FOR UPDATE`;
  if (!lignes.length) throw new ErreurMetier("Organisation inconnue.", 404);
}

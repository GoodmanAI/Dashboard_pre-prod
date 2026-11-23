import type { Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";

/**
 * Un concurrent qu'une organisation désigne (en place, ou gagnant d'une affaire
 * perdue) doit exister, et ne peut plus être supprimé entre la vérification et
 * l'écriture : le verrou partagé attend la fin des suppressions en cours, et la
 * suppression, qui prend le verrou exclusif, attend la fin de cette écriture
 * avant de compter les organisations liées. L'appelant tient, s'il en faut un,
 * le verrou de l'organisation : toujours avant celui-ci.
 */
export async function verrouillerConcurrentLie(tx: Prisma.TransactionClient, id: number): Promise<void> {
  const lignes = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmConcurrent" WHERE id = ${id} FOR SHARE`;
  if (!lignes.length) throw new ErreurMetier("Concurrent inconnu.", 400);
}

import type { Prisma } from "@prisma/client";
import type { CompteEquipe } from "./destinataires";

/**
 * L'équipe telle que les commentaires la voient (lot T) : les comptes internes,
 * leur accès et leur département, en une lecture. L'écriture la lit dans sa
 * transaction (les destinataires de cet instant), le sélecteur « Prévenir »
 * avec le client ordinaire : les deux appliquent ensuite la même règle
 * (`calculerDestinataires`), sur la même liste.
 */
export async function lireEquipe(client: Pick<Prisma.TransactionClient, "user">): Promise<CompteEquipe[]> {
  const comptes = await client.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, name: true, role: true, accesPilot: { select: { retireLe: true } }, departementCompte: { select: { departement: true } } },
  });
  return comptes.map((c) => ({
    id: c.id, nom: c.name, role: c.role, departement: c.departementCompte?.departement ?? null, accesRetire: c.accesPilot?.retireLe != null,
  }));
}

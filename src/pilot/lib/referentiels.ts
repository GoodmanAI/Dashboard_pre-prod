import { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

export const comptesInternes = () => prisma.user.findMany({
  where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" },
});
export const produits = () => prisma.product.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
export const comptesDashboard = () => prisma.user.findMany({
  where: { role: "CLIENT" }, select: { id: true, email: true, name: true }, orderBy: { email: "asc" },
});
export type CompteProduit = { id: number; productId: number; userId: number; email: string };
/** Une seule lecture, y compris l'email ; aucune écriture du Dashboard. */
export const userProductsLibres = (productId?: number) => prisma.$queryRaw<CompteProduit[]>(Prisma.sql`
  SELECT up.id, up."productId", up."userId", u.email
  FROM "UserProduct" up JOIN "User" u ON u.id = up."userId"
  WHERE up."removedAt" IS NULL AND u.role = 'CLIENT'
    AND NOT EXISTS (SELECT 1 FROM "CrmCentreProduit" r WHERE r."userProductId" = up.id)
    ${productId === undefined ? Prisma.empty : Prisma.sql`AND up."productId" = ${productId}`}
  ORDER BY u.email, up.id
`);

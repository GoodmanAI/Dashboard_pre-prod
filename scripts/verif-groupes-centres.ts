/**
 * Affiche ce que chaque groupe de `src/lib/groupesCentres.ts` résout réellement
 * en base : User.id, UserProduct.id, nom du centre.
 *
 * À passer AVANT de déployer une modification des groupes. Les groupes
 * historiques sont déclarés en `User.id`, les nouveaux en `UserProduct.id` :
 * ce script est le seul moyen de vérifier qu'on parle bien des mêmes centres.
 *
 *   npx tsx scripts/verif-groupes-centres.ts
 */
import { PrismaClient } from "@prisma/client";
import { GROUPES_CENTRES } from "../src/lib/groupesCentres";

const prisma = new PrismaClient();

async function main() {
  for (const groupe of GROUPES_CENTRES) {
    console.log(`\n── ${groupe.nom}`);
    console.log(
      `   déclaré par ${
        groupe.userIds ? `User.id ${groupe.userIds.join(", ")}` : ""
      }${groupe.userIds && groupe.userProductIds ? " + " : ""}${
        groupe.userProductIds
          ? `UserProduct.id ${groupe.userProductIds.join(", ")}`
          : ""
      }`
    );

    const userIds = new Set<number>(groupe.userIds ?? []);
    if (groupe.userProductIds?.length) {
      const produits = await prisma.userProduct.findMany({
        where: { id: { in: groupe.userProductIds } },
        select: { id: true, userId: true },
      });
      for (const p of produits) userIds.add(p.userId);

      const manquants = groupe.userProductIds.filter(
        (id) => !produits.some((p) => p.id === id)
      );
      if (manquants.length) {
        console.log(
          `   ⚠️  UserProduct introuvable : ${manquants.join(", ")}`
        );
      }
    }

    if (userIds.size === 0) {
      console.log("   ⚠️  aucun membre résolu");
      continue;
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: {
        id: true,
        name: true,
        email: true,
        userProducts: {
          where: { productId: 2, removedAt: null },
          select: { id: true },
        },
      },
    });

    for (const id of userIds) {
      const u = users.find((x) => x.id === id);
      if (!u) {
        console.log(`   ⚠️  User ${id} introuvable`);
        continue;
      }
      const upids = u.userProducts.map((p) => p.id).join(", ") || "aucun";
      console.log(
        `   User ${String(u.id).padEnd(4)} upid ${upids.padEnd(10)} ${
          u.name ?? u.email
        }`
      );
    }
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

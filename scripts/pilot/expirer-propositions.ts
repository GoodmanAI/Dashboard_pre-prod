// 0 6 * * * cd /chemin/du/dashboard && npx tsx scripts/expirer-propositions.ts >> /var/log/pilot-propositions.log 2>&1
import { expirerPropositions } from "../../src/pilot/lib/propositions/expirerPropositions";
import { prisma } from "../../src/pilot/lib/prisma";

expirerPropositions(new Date()).then((nombre) => {
  console.log(JSON.stringify({ niveau: "info", message: "Expiration des propositions", nombre }));
}).catch((erreur: unknown) => {
  console.error(JSON.stringify({ niveau: "erreur", message: "Expiration des propositions échouée", cause: erreur instanceof Error ? erreur.name : "inconnue" }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

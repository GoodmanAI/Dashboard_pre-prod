// Cron à poser au Dashboard :
// */15 * * * * cd /var/www/Dashboard_pre-prod && npx tsx scripts/pilot/evaluer-parc.ts >> /var/log/pilot-evaluation.log 2>&1
// Après la check-list, les alertes actives partent dans la cloche commune (une fois par cause).
import { evaluerParc } from "../../src/pilot/lib/checklist/evaluer";
import { prisma } from "../../src/pilot/lib/prisma";
import { notifierAlertesDuParc } from "../../src/pilot/lib/alertes/notifier";

evaluerParc().then(async (comptes) => {
  console.log(JSON.stringify({ niveau: "info", message: "Évaluation du parc", ...comptes }));
  const alertes = await notifierAlertesDuParc();
  console.log(JSON.stringify({ niveau: "info", message: "Alertes vers la cloche", ...alertes }));
}).catch((erreur: unknown) => {
  console.error(JSON.stringify({ niveau: "erreur", message: "Évaluation du parc échouée", cause: erreur instanceof Error ? erreur.name : "inconnue" }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

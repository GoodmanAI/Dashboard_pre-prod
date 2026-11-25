/**
 * Relance du support (25/11/2026, plan lyrae/plans/2026-11-support-dans-pilot.md) : un
 * sujet resté « à transmettre » un jour ouvré relance le commercial du client (cloche
 * et mail, tout le monde en copie), puis chaque jour ouvré tant que rien ne bouge.
 *
 *   npm run pilot:relancer-support            # relance
 *   npm run pilot:relancer-support -- --essai # compte, n'écrit rien
 *
 * Cron du VPS, toutes les heures de 8 h à 19 h du lundi au vendredi (heure de Paris).
 */
import { prisma } from "../../src/pilot/lib/prisma";
import { relancerSujets } from "../../src/pilot/lib/support/gerer";

async function main() {
  const essai = process.argv.includes("--essai");
  const n = await relancerSujets(new Date(), essai);
  console.log(JSON.stringify({ niveau: "info", message: essai ? "Relances du support à faire" : "Relances du support faites", relances: n }));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

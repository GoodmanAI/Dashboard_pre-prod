// Aligne une fois le statut des centres du Dashboard (`CentreStatut`) sur Pilot, qui fait foi
// depuis le 27/11/2026 (plan lyrae/plans/2026-11-separation-dashboard-pilot.md, lot L5).
//
//   npx tsx scripts/pilot/aligner-statuts.ts            → montre les écarts, n'écrit rien
//   npx tsx scripts/pilot/aligner-statuts.ts --ecrire   → écrit les statuts attendus
//
// Seuls les comptes rattachés à une fiche de Pilot sont concernés ; un compte du Dashboard
// sans fiche garde son statut tant qu'on ne l'a pas relié (« Comptes à relier »).
import { prisma } from "../../src/pilot/lib/prisma";
import { ecrireStatuts, statutsAttendus } from "../../src/pilot/lib/centres/statutDashboard";

async function principal() {
  const ecrire = process.argv.includes("--ecrire");
  const organisations = await prisma.crmOrganisation.findMany({ select: { id: true, raisonSocialeNom: true } });
  const actuels = new Map(
    (await prisma.$queryRaw<Array<{ userProductId: number; statut: string }>>`SELECT "userProductId", "statut" FROM "CentreStatut"`)
      .map((r) => [r.userProductId, r.statut])
  );
  let ecarts = 0;
  for (const o of organisations) {
    await prisma.$transaction(async (tx) => {
      const attendus = await statutsAttendus(tx, { organisationId: o.id });
      const differents = attendus.filter((a) => (actuels.get(a.userProductId) ?? "integration (jamais classé)") !== a.statut);
      for (const d of differents) {
        ecarts += 1;
        console.log(`${o.raisonSocialeNom} · compte ${d.userProductId} : ${actuels.get(d.userProductId) ?? "jamais classé"} → ${d.statut}`);
      }
      if (ecrire && differents.length) await ecrireStatuts(tx, differents, null);
    });
  }
  console.log(ecarts ? `${ecarts} écart(s)${ecrire ? ", écrits." : ". Rien n'est écrit sans --ecrire."}` : "Aucun écart : le Dashboard dit déjà ce que dit Pilot.");
}

principal().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

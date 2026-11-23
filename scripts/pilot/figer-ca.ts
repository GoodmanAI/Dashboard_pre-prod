// 0 2 1 * * cd /chemin/du/dashboard && npx tsx scripts/figer-ca.ts >> /var/log/pilot-ca.log 2>&1
// npm run figer [-- AAAA-MM] : par défaut, le mois précédent.
import { figerMois } from "../../src/pilot/lib/ca/figer";
import { rattraperFormations } from "../../src/pilot/lib/ca/rattraperFormations";
import { decalerMois } from "../../src/pilot/lib/ca/projeter";
import { moisIso } from "../../src/pilot/lib/ca/reel";
import { ErreurMetier } from "../../src/pilot/lib/erreurs";
import { prisma } from "../../src/pilot/lib/prisma";

async function main() {
  const maintenant = new Date();
  const argument = process.argv[2];
  const lu = argument === undefined ? null : /^(\d{4})-(0[1-9]|1[0-2])$/.exec(argument);
  if (argument !== undefined && !lu) throw new ErreurMetier("Mois attendu au format AAAA-MM.", 400);
  const mois = lu ? new Date(Date.UTC(Number(lu[1]), Number(lu[2]) - 1, 1)) : decalerMois(maintenant, -1);
  const resultat = await figerMois(mois, maintenant);
  console.log(JSON.stringify({ niveau: "info", message: resultat.message, mois: moisIso(mois), ecrites: resultat.ecrites, dejaFigees: resultat.dejaFigees }));
  // Le passage mensuel reprend aussi les formations dont le prix a été complété tardivement.
  // Un mois demandé explicitement garde le périmètre de l'ancien outil.
  if (!lu) {
    const rattrapage = await rattraperFormations(maintenant);
    console.log(JSON.stringify({ niveau: "info", message: "Rattrapage des formations terminé", ecrites: rattrapage.ecrites }));
  }
}
main().catch((erreur: unknown) => {
  // Un refus métier est un texte du code ; une autre erreur ne sort que par son nom.
  console.error(JSON.stringify({ niveau: "erreur", message: "Réel mensuel non figé",
    cause: erreur instanceof ErreurMetier ? erreur.message : erreur instanceof Error ? erreur.name : "inconnue" }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

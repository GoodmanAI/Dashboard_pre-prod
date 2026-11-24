import { readFile } from "node:fs/promises";
import { importer, resumerImport, ErreurCsv } from "../../src/pilot/lib/import/csv";
import { compter } from "../../src/pilot/lib/texte";
import { prisma } from "../../src/pilot/lib/prisma";

async function main() {
  const args = process.argv.slice(2), chemin = args[0], auteurIndex = args.indexOf("--auteur");
  if (!chemin || chemin.startsWith("--") || (auteurIndex >= 0 && !args[auteurIndex + 1])) {
    throw new ErreurCsv("Usage : npm run import -- chemin.csv [--essai] [--auteur email]");
  }
  let auteurId: number | null = null;
  if (auteurIndex >= 0) {
    const compte = await prisma.user.findFirst({ where: { email: { equals: args[auteurIndex + 1], mode: "insensitive" }, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    if (!compte) throw new ErreurCsv("Auteur : compte interne inconnu.");
    auteurId = compte.id;
  }
  const essai = args.includes("--essai");
  const rapport = await importer(await readFile(chemin, "utf8"), { auteurId, essai });
  if (essai) console.log("Essai : aucune écriture.");
  console.log(`${resumerImport(rapport)}, ${compter(rapport.inchangees, "inchangée")}.`);
  for (const r of rapport.refusees) console.log(r.raison);
  for (const a of rapport.avertissements) if (!essai || a.message !== "Essai : aucune écriture.") console.log("Ligne " + a.ligne + " : " + a.message);
  if (rapport.refusees.length) process.exitCode = 1;
}
main().catch((erreur: unknown) => {
  console.error(erreur instanceof ErreurCsv ? erreur.message : "Import interrompu. Vérifiez le fichier et la connexion.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

/**
 * Prepare le questionnaire en ligne d'un document demande (lot B,
 * plans/2026-10-questionnaires-en-ligne.md, workspace).
 *
 *   python -I scripts/formulaires/fonds.py <modele.pdf> <fonds.json> --signature <sig.png>
 *   npx tsx scripts/formulaires/preparer.ts <definition.json> <modele.pdf> <fonds.json> <sortie-dir> [--signature sig.png]
 *
 * Ecrit dans <sortie-dir> :
 *   - formulaire.json : la definition validee, avec les fonds de page ; c'est
 *     ce que `deposer.ts` range dans "DocumentDemande"."formulaire" ;
 *   - empreinte.txt   : sha256 du modele, pour "formulaireEmpreinte" ;
 *   - essai-oui.pdf, essai-non.pdf : le modele rempli avec des reponses
 *     factices (premiere option partout, puis derniere), pour verifier les
 *     places a l'oeil (rendu par PyMuPDF ou dans un lecteur PDF).
 *
 * Aucun acces a la base.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { formulaireSchema, alertesDe, verifierReponses, type Reponses, type Formulaire } from "../../src/lib/formulaires";
import { empreinteModele, remplirPdf } from "../../src/lib/formulairesPdf";

function reponsesFactices(f: Formulaire, sens: "premiere" | "derniere"): Reponses {
  const r: Reponses = {};
  for (const c of f.champs) {
    switch (c.type) {
      case "texte":
        r[c.id] =
          c.format === "nombre" ? (c.id === "poids" ? "72" : "178")
          : c.format === "mail" ? "camille.le-goff@exemple.fr"
          : c.format === "telephone" ? "06 12 34 56 78"
          : c.prerempli === "nom_prenom" ? "Le Goff Lou"
          : c.id.endsWith("_ref") ? "03/2019 Medtronic X2"
          : c.prerempli === "prenom" ? "Camille"
          : "Le Goff-Kerjean";
        break;
      case "date":
        r[c.id] = "1987-04-23";
        break;
      case "choix":
        r[c.id] = c.multiple
          ? c.options.map((o) => o.valeur)
          : sens === "premiere" ? c.options[0].valeur : c.options[c.options.length - 1].valeur;
        break;
      case "case":
        r[c.id] = true;
        break;
    }
  }
  return r;
}

async function main() {
  const [defPath, modelePath, fondsPath, sortie] = process.argv.slice(2);
  if (!sortie) {
    console.error("usage : preparer.ts <definition.json> <modele.pdf> <fonds.json> <sortie-dir> [--signature sig.png]");
    process.exit(1);
  }
  const iSig = process.argv.indexOf("--signature");
  const signature = iSig > 0 ? readFileSync(process.argv[iSig + 1]) : null;

  const brute = JSON.parse(readFileSync(defPath, "utf-8"));
  for (const k of Object.keys(brute)) if (k.startsWith("_")) delete brute[k];
  brute.pages = JSON.parse(readFileSync(fondsPath, "utf-8"));

  const lu = formulaireSchema.safeParse(brute);
  if (!lu.success) {
    console.error("Definition invalide :");
    for (const i of lu.error.issues) console.error(" -", i.path.join("."), i.message);
    process.exit(1);
  }
  const f = lu.data;
  const modele = readFileSync(modelePath);

  mkdirSync(sortie, { recursive: true });
  writeFileSync(path.join(sortie, "formulaire.json"), JSON.stringify(f));
  writeFileSync(path.join(sortie, "empreinte.txt"), empreinteModele(modele));

  for (const sens of ["premiere", "derniere"] as const) {
    const verifie = verifierReponses(f, reponsesFactices(f, sens));
    if (!verifie.ok) {
      console.error("Reponses factices refusees :", verifie.erreurs);
      process.exit(1);
    }
    const pdf = await remplirPdf(modele, f, verifie.reponses, signature);
    const nom = sens === "premiere" ? "essai-oui.pdf" : "essai-non.pdf";
    writeFileSync(path.join(sortie, nom), pdf);
    console.log(`${nom} : ${Math.round(pdf.length / 1024)} Ko, alertes : ${alertesDe(f, verifie.reponses).join(" ; ") || "aucune"}`);
  }
  const questions = f.champs.filter((c) => c.type !== "signature" && c.type !== "dateDuJour").length;
  console.log(`${f.etapes.length} etapes, ${questions} questions, empreinte ${empreinteModele(modele).slice(0, 12)}…`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

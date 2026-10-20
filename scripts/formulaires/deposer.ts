/**
 * Range un questionnaire en ligne prepare dans "DocumentDemande" (lot B,
 * plans/2026-10-questionnaires-en-ligne.md, workspace).
 *
 *   npx tsx scripts/formulaires/deposer.ts <documentDemandeId> <formulaire.json>            # essai a blanc
 *   npx tsx scripts/formulaires/deposer.ts <documentDemandeId> <formulaire.json> --ecrire   # ecrit
 *   npx tsx scripts/formulaires/deposer.ts <documentDemandeId> --retirer [--ecrire]          # retour au telechargement
 *
 * <formulaire.json> sort de `preparer.ts`. Le script relit le modele en base,
 * refuse si le formulaire ne passe pas la validation ou si le document n'a
 * pas de modele, et pose l'empreinte du modele EN BASE : c'est lui que le
 * formulaire remplira. Avant d'ecrire, comparer l'empreinte affichee a
 * `empreinte.txt` de la preparation (meme PDF que celui des essais).
 *
 * Lit DATABASE_URL (le .env du depot deploye sur le VPS). Sans --ecrire,
 * rien n'est modifie.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { formulaireSchema } from "../../src/lib/formulaires";
import { empreinteModele } from "../../src/lib/formulairesPdf";

async function main() {
  const [idBrut, chemin] = process.argv.slice(2);
  const ecrire = process.argv.includes("--ecrire");
  const retirer = process.argv.includes("--retirer");
  const id = Number(idBrut);
  if (!Number.isInteger(id) || (!retirer && !chemin)) {
    console.error("usage : deposer.ts <documentDemandeId> <formulaire.json> [--ecrire] | <documentDemandeId> --retirer [--ecrire]");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query<{
      libelle: string;
      userProductId: number;
      modeleContenu: Buffer | null;
      modeleNom: string | null;
      formulaireEmpreinte: string | null;
    }>(
      `SELECT "libelle", "userProductId", "modeleContenu", "modeleNom", "formulaireEmpreinte"
         FROM "DocumentDemande" WHERE "id" = $1`,
      [id]
    );
    const doc = res.rows[0];
    if (!doc) throw new Error(`document ${id} introuvable`);
    console.log(`document ${id} : « ${doc.libelle} », client ${doc.userProductId}, modele ${doc.modeleNom ?? "aucun"}`);
    console.log(`formulaire actuel : ${doc.formulaireEmpreinte ? "prepare (" + doc.formulaireEmpreinte.slice(0, 12) + "…)" : "aucun"}`);

    if (retirer) {
      if (ecrire) {
        await client.query(
          `UPDATE "DocumentDemande" SET "formulaire" = NULL, "formulaireEmpreinte" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
          [id]
        );
        console.log("formulaire retire : le patient telecharge le modele.");
      } else {
        console.log("essai a blanc : --ecrire pour retirer.");
      }
      return;
    }

    if (!doc.modeleContenu) throw new Error("ce document n'a pas de modele PDF");
    const lu = formulaireSchema.safeParse(JSON.parse(readFileSync(chemin, "utf-8")));
    if (!lu.success) {
      for (const i of lu.error.issues) console.error(" -", i.path.join("."), i.message);
      throw new Error("formulaire invalide");
    }
    const empreinte = empreinteModele(doc.modeleContenu);
    const questions = lu.data.champs.filter((c) => c.type !== "signature" && c.type !== "dateDuJour").length;
    console.log(`nouveau : ${lu.data.etapes.length} etapes, ${questions} questions ; empreinte du modele en base ${empreinte}`);

    if (!ecrire) {
      console.log("essai a blanc : comparer l'empreinte a empreinte.txt, puis relancer avec --ecrire.");
      return;
    }
    await client.query(
      `UPDATE "DocumentDemande"
          SET "formulaire" = $2::jsonb, "formulaireEmpreinte" = $3, "updatedAt" = NOW()
        WHERE "id" = $1`,
      [id, JSON.stringify(lu.data), empreinte]
    );
    console.log("formulaire ecrit : le patient remplit ce document en ligne.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

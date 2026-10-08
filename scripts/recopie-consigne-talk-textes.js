/**
 * Recopie la consigne de fin de rendez-vous de `talk.site` vers `talk.textes`
 * (08/10/2026). Plan : `lyrae/plans/2026-10-confirmation-personnalisable.md`.
 *
 * `rdvInstructionSentence` quitte le domaine `talk.site` (réservé à
 * l'administration) pour `talk.textes`, que le client règle lui-même. Une fois le
 * nouveau code en ligne, `GET /api/configuration` ignore la clé restée dans
 * `talk.site` : **ce script se joue AVANT le déploiement**, sinon la consigne d'un
 * centre disparaît entre les deux et le robot reprend le texte standard.
 * Écrire une ligne `talk.textes` avant le déploiement est sans effet : l'ancien
 * code ne lit pas ce domaine.
 *
 * - À blanc par défaut : affiche ce qui serait copié, n'écrit rien.
 * - `--appliquer` : écrit, centre par centre, dans une transaction.
 * - N'écrase jamais une consigne déjà présente dans `talk.textes`.
 * - Ne retire rien de `talk.site` : la valeur y reste, ignorée, et sert de
 *   retour arrière si le code doit être retiré.
 *
 *   node scripts/recopie-consigne-talk-textes.js              # à blanc
 *   node scripts/recopie-consigne-talk-textes.js --appliquer
 *
 * Lit `DATABASE_URL` dans l'environnement ou dans `.env`. À lancer sur le VPS,
 * depuis le dépôt déployé (le `.env` du poste pointe aussi sur la production).
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// `dotenv` n'est pas une dépendance du dépôt : lecture minimale du `.env`.
if (!process.env.DATABASE_URL) {
  const fichier = path.join(__dirname, "..", ".env");
  if (fs.existsSync(fichier)) {
    for (const ligne of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) {
      const m = ligne.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
    }
  }
}

const APPLIQUER = process.argv.includes("--appliquer");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL absente.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT s."userProductId",
              s."valeur"->>'rdvInstructionSentence' AS consigne,
              t."valeur" AS textes
         FROM "ProductConfig" s
         LEFT JOIN "ProductConfig" t
           ON t."userProductId" = s."userProductId" AND t."domaine" = 'talk.textes'
        WHERE s."domaine" = 'talk.site'
          AND coalesce(trim(s."valeur"->>'rdvInstructionSentence'), '') <> ''
        ORDER BY s."userProductId"`
    );

    console.log(
      `${APPLIQUER ? "ÉCRITURE" : "À BLANC"} : ${rows.length} centre(s) avec une consigne dans talk.site`
    );
    let copies = 0;
    for (const r of rows) {
      const dejaLa =
        r.textes && typeof r.textes.rdvInstructionSentence === "string" && r.textes.rdvInstructionSentence.trim();
      if (dejaLa) {
        console.log(`  upid ${r.userProductId} : déjà dans talk.textes, laissé tel quel`);
        continue;
      }
      console.log(`  upid ${r.userProductId} : ${JSON.stringify(r.consigne)}`);
      if (!APPLIQUER) continue;
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
         VALUES ($1, 'talk.textes', jsonb_build_object('rdvInstructionSentence', $2::text), 1)
         ON CONFLICT ("userProductId", "domaine")
           DO UPDATE SET "valeur"    = "ProductConfig"."valeur"
                                       || jsonb_build_object('rdvInstructionSentence', $2::text),
                         "version"   = "ProductConfig"."version" + 1,
                         "updatedAt" = NOW()`,
        [r.userProductId, r.consigne.trim()]
      );
      await client.query("COMMIT");
      copies++;
    }
    console.log(APPLIQUER ? `${copies} centre(s) copiés.` : "Rien n'a été écrit. Relancer avec --appliquer.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

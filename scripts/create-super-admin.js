/* eslint-disable */
/**
 * Bootstrap du tout premier SUPER_ADMIN (chantier 3, Lot A).
 * -----------------------------------------------------------------------------
 * Cree un compte SUPER_ADMIN via SQL direct, apres la migration.
 * Chicken-and-egg : la creation via /admin/users necessite deja d'etre
 * SUPER_ADMIN, donc le premier doit etre insere manuellement.
 *
 * Prompt le password via stdin masque (pas visible dans l'historique bash
 * ni dans ps -ef). Hash bcrypt 10 rounds (identique aux autres endpoints).
 *
 * Usage :
 *   node scripts/create-super-admin.js
 *
 * Ou avec email/name pre-fournis :
 *   node scripts/create-super-admin.js "Admin" "admin.super@neuracorp.ai"
 *
 * Prerequis : la migration 2026_08_03_add_super_admin_permissions.sql doit
 * avoir ete appliquee (pour que l'enum Role.SUPER_ADMIN existe).
 */

const bcrypt = require("bcryptjs");
const readline = require("readline");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * Prompt stdin en masquant les caracteres du password (via ANSI trick).
 * Retourne le password saisi (string).
 */
function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let muted = false;
    // Override _writeToOutput pour masquer l'echo du password
    rl._writeToOutput = function (stringToWrite) {
      if (muted) {
        rl.output.write("*");
      } else {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Verifie que le password respecte la meme policy que passwordSchema.ts :
 *   min 12 chars, au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 special.
 * On duplique ici (pas d'import TS depuis un script JS) mais on garde le
 * meme jeu de regles pour eviter les divergences.
 */
function validatePasswordPolicy(pw) {
  const errors = [];
  if (pw.length < 12) errors.push("min 12 caracteres");
  if (!/[a-z]/.test(pw)) errors.push("min 1 minuscule");
  if (!/[A-Z]/.test(pw)) errors.push("min 1 majuscule");
  if (!/\d/.test(pw)) errors.push("min 1 chiffre");
  if (!/[^a-zA-Z0-9]/.test(pw)) errors.push("min 1 caractere special");
  return errors;
}

async function main() {
  console.log("=".repeat(70));
  console.log("Bootstrap SUPER_ADMIN (chantier 3, Lot A)");
  console.log("=".repeat(70));
  console.log("");

  // Args ou prompts
  const argName = process.argv[2];
  const argEmail = process.argv[3];

  const name = argName || (await prompt("Nom du compte (ex: Admin) : "));
  const email = argEmail || (await prompt("Email / identifiant (ex: admin.super@neuracorp.ai) : "));
  const emailNormalized = email.trim().toLowerCase();

  if (!name || !emailNormalized) {
    console.error("Nom et email requis.");
    process.exit(1);
  }

  // Verifie unicite
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: emailNormalized }, { name }] },
    select: { id: true, email: true, name: true, role: true },
  });
  if (existing) {
    console.error("");
    console.error(`ERREUR : un compte existe deja avec cet ${existing.email === emailNormalized ? "email" : "nom"} :`);
    console.error(`   id=${existing.id}, name="${existing.name}", email="${existing.email}", role=${existing.role}`);
    console.error("");
    console.error("Solutions :");
    console.error("  1. Choisir un autre email/nom");
    console.error("  2. Promouvoir le compte existant via SQL :");
    console.error(`     UPDATE "User" SET role='SUPER_ADMIN' WHERE id=${existing.id};`);
    process.exit(1);
  }

  // Prompt password (masque)
  const password = await promptPassword("Mot de passe (min 12 chars, maj/min/chiffre/special) : ");
  const passwordConfirm = await promptPassword("Confirmer le mot de passe : ");

  if (password !== passwordConfirm) {
    console.error("ERREUR : les mots de passe ne correspondent pas.");
    process.exit(1);
  }

  const policyErrors = validatePasswordPolicy(password);
  if (policyErrors.length > 0) {
    console.error("ERREUR policy password :");
    policyErrors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Hash bcrypt (10 rounds, coherent avec le reste du code)
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      email: emailNormalized,
      password: hashedPassword,
      name,
      role: "SUPER_ADMIN",
      tokenVersion: 0,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  // Audit log (ira dans Loki via stdout -> Alloy)
  const auditLine = {
    audit: true,
    category: "account",
    action: "create-super-admin",
    timestamp: new Date().toISOString(),
    success: true,
    actorId: null,
    actorEmail: "system-bootstrap",
    actorRole: "system",
    actorIp: null,
    actorUserAgent: `node scripts/create-super-admin.js`,
    targetType: "user",
    targetId: newUser.id,
    targetLabel: newUser.email,
    metadata: { name: newUser.name },
  };
  console.log(JSON.stringify(auditLine));

  console.log("");
  console.log("=".repeat(70));
  console.log("SUCCES : compte SUPER_ADMIN cree.");
  console.log("=".repeat(70));
  console.log(`  id     : ${newUser.id}`);
  console.log(`  name   : ${newUser.name}`);
  console.log(`  email  : ${newUser.email}`);
  console.log(`  role   : ${newUser.role}`);
  console.log(`  cree le: ${newUser.createdAt.toISOString()}`);
  console.log("");
  console.log("Prochaines etapes :");
  console.log("  1. Redemarrer le dashboard : pm2 restart dashboard (ou all)");
  console.log("  2. Log OUT du compte actuel");
  console.log("  3. Log IN avec les nouveaux identifiants");
  console.log("  4. Aller sur /admin/users pour gerer les comptes");
  console.log("");
}

main()
  .catch((err) => {
    console.error("");
    console.error("ERREUR lors de la creation :");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

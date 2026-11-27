#!/usr/bin/env node
/**
 * Frontière entre Pilot (CRM interne) et le Dashboard, vérifiée à chaque passage de
 * `verify_changed.py` (demande d'Enzo du 24/11/2026, plan
 * lyrae/plans/2026-11-pilot-dans-le-dashboard.md, « Cloisons »).
 *
 * Pilot vit dans le même processus et la même base que le Dashboard, qui porte des
 * données patient (transcriptions d'appels, ordonnances, demandes de rappel, file
 * d'attente). Rien dans le langage n'empêche le code de Pilot de les lire : ce contrôle
 * le fait, par refus par défaut.
 *
 * Règles :
 *   R1. Le code de Pilot n'importe du Dashboard que les modules de MODULES_PERMIS, et
 *       jamais le pool `pg` (`@/lib/db`, `pg`), qui ouvre les tables hors schéma.
 *   R2. Le code de Pilot ne nomme aucune table de TABLES_PATIENT, ni en SQL brut
 *       (`"CallConversation"`) ni par le client Prisma (`prisma.callConversation.count`),
 *       sauf dans les fichiers de LECTURES_PERMISES. Chacun y est épinglé par son
 *       empreinte : s'il change, le contrôle échoue jusqu'à ce qu'on l'ait relu et
 *       qu'on ait recopié la nouvelle empreinte (`--empreintes` l'affiche).
 *   R3. Le Dashboard n'importe rien de Pilot, sauf depuis IMPORTEURS_PERMIS. Ainsi
 *       Pilot reste séparable : le jour où il part dans sa propre application, seuls
 *       ces fichiers changent.
 *
 * Les commentaires sont retirés avant la recherche : un fichier qui EXPLIQUE qu'il ne
 * lit pas une table ne doit pas échouer.
 *
 * Usage : node scripts/pilot/controle-frontiere.mjs [--empreintes]
 * Sortie 0 si tout passe, 1 sinon.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Les dossiers du code de Pilot. */
const DOSSIERS_PILOT = ["src/pilot", "src/app/pilot", "src/app/api/pilot", "scripts/pilot"];

/**
 * Les modules du Dashboard que Pilot a le droit d'importer. Ajouter une ligne, c'est
 * dire que ce module ne mène à aucune donnée patient, en une phrase.
 */
const MODULES_PERMIS = {
  "@/lib/prisma": "client Prisma canonique ; ce que Pilot en lit est vérifié par R2",
  "@/lib/authOptions": "la session du Dashboard, partagée",
  "@/lib/espaces": "adresses des deux espaces et gardes du middleware",
  "@/lib/produits": "noms des produits",
  "@/lib/jetons": "jetons de style",
  "@/lib/centreStatut": "statut de suivi d'un centre (intégration, production)",
  "@/lib/appelsSansParole": "le fragment SQL « le patient a parlé » ; ne lit rien seul",
  "@/lib/completude": "complétude de la configuration d'un centre, sans donnée patient",
  "@/lib/completude/lecture": "lecture de la configuration pour la complétude",
  "@/lib/cheminsCentre": "adresses des écrans d'un centre",
  "@/lib/sallesFactureesLecture": "salles facturées d'un client (configuration)",
  "@/lib/accesInternes": "droits des comptes internes au Dashboard, lus par l'écran Équipe",
  "@/lib/brevoMailer": "envoi des mails du support de Pilot (25/11/2026), aucune lecture de table",
  "@/components/admin/SectionHeader": "composant d'affichage",
  "@/components/shared/Retour": "composant d'affichage",
  "@/components/notifications/NotificationBell": "la cloche commune (notifications internes)",
  "@/components/espaces/BasculeEspace": "bouton de bascule entre les espaces",
};

/** Paquets interdits au code de Pilot. */
const PAQUETS_INTERDITS = ["pg", "pg-pool", "pg-promise"];

/**
 * Les tables qui portent des données patient ou des traces sensibles, avec le nom de
 * leur accesseur Prisma quand elles sont au schéma.
 */
const TABLES_PATIENT = {
  CallConversation: "callConversation", // transcriptions d'appels, numéros
  ReceivedCalls: "receivedCalls", // numéros appelants
  FileSubmission: "fileSubmission", // fichiers déposés
  Ticket: "ticket", // échanges avec les centres, parfois des noms de patients
  TicketMessage: "ticketMessage",
  LoginAttempt: "loginAttempt", // adresses IP, e-mails
  LyraeExplainDetails: "lyraeExplainDetails",
  KonnectDemandesRappel: null, // nom, prénom, téléphone du patient
  KonnectFileAttente: null,
  KonnectFileAttenteEvenement: null,
  PrescriptionUpload: null, // ordonnances déposées
  PrescriptionDocument: null,
  PrescriptionParMail: null,
  PrescriptionAccessLog: null,
  AppointmentConfirmation: null, // RDV et téléphone du patient (relances)
  ReminderSent: null,
  SuiviCarte: null, // notes des secrétaires sur un patient
};

/**
 * Les seuls fichiers de Pilot qui lisent une table patient, avec ce qu'ils en font et
 * leur empreinte. Une empreinte qui ne correspond plus fait échouer le contrôle.
 */
const LECTURES_PERMISES = {
  "src/pilot/lib/ca/compteurs.ts": {
    tables: ["CallConversation"],
    pourquoi: "part variable du CA : nombre d'appels et de RDV par centre et par mois, aucun appel ne sort",
    empreinte: "bb77ac07385b4a3d",
  },
  "src/pilot/lib/completude/adapter.ts": {
    tables: ["CallConversation"],
    pourquoi: "étape « premier appel réel » : date du dernier appel et un booléen RDV par centre",
    empreinte: "23528dcd7e504086",
  },
  "src/pilot/lib/parc/usage.ts": {
    tables: ["CallConversation"],
    pourquoi: "page « Parc » : nombre d'appels et de RDV par centre sur quatre semaines, aucun appel ne sort",
    empreinte: "4f6f0d89cce5ac85",
  },
};

/** Les fichiers du Dashboard qui ont le droit d'importer Pilot. */
const IMPORTEURS_PERMIS = {
  "src/middleware.ts": "garde d'origine et chemin demandé des pages de Pilot",
};

/** Ce fichier nomme les tables patient pour les chercher : il ne se contrôle pas lui-même. */
const SOI = "scripts/pilot/controle-frontiere.mjs";

const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const METHODES_PRISMA =
  "findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy|create|createMany|update|updateMany|upsert|delete|deleteMany";

function lister(dossier) {
  const absolu = join(RACINE, dossier);
  let entrees;
  try {
    entrees = readdirSync(absolu);
  } catch {
    return [];
  }
  const fichiers = [];
  for (const nom of entrees) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const chemin = join(dossier, nom);
    if (statSync(join(RACINE, chemin)).isDirectory()) fichiers.push(...lister(chemin));
    else if (EXTENSIONS.test(nom)) fichiers.push(chemin.split(sep).join("/"));
  }
  return fichiers;
}

/** Retire les commentaires, sans toucher aux chaînes (assez juste pour notre code). */
function sansCommentaires(source) {
  let sortie = "";
  let i = 0;
  let chaine = null;
  while (i < source.length) {
    const c = source[i];
    const suivant = source[i + 1];
    if (chaine) {
      sortie += c;
      if (c === "\\") {
        sortie += suivant ?? "";
        i += 2;
        continue;
      }
      if (c === chaine) chaine = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      chaine = c;
      sortie += c;
      i++;
      continue;
    }
    if (c === "/" && suivant === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && suivant === "*") {
      const fin = source.indexOf("*/", i + 2);
      const bloc = source.slice(i, fin === -1 ? source.length : fin + 2);
      sortie += bloc.replace(/[^\n]/g, " ");
      i = fin === -1 ? source.length : fin + 2;
      continue;
    }
    sortie += c;
    i++;
  }
  return sortie;
}

function empreinte(source) {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

function specificateurs(code) {
  const out = [];
  const motifs = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm,
  ];
  for (const motif of motifs) for (const m of code.matchAll(motif)) out.push(m[1]);
  return out;
}

const estPilot = (fichier) => DOSSIERS_PILOT.some((d) => fichier === d || fichier.startsWith(d + "/"));

/** Le module visé, en `@/…` quand il est sous `src/`, ou null pour un paquet. */
function cible(fichier, spec) {
  if (spec.startsWith("@/")) return { alias: spec.replace(/\/index$/, ""), chemin: "src/" + spec.slice(2) };
  if (spec.startsWith(".")) {
    const chemin = relative(RACINE, resolve(RACINE, dirname(fichier), spec)).split(sep).join("/");
    const alias = chemin.startsWith("src/") ? "@/" + chemin.slice(4).replace(/\.(ts|tsx|js|mjs)$/, "").replace(/\/index$/, "") : null;
    return { alias, chemin };
  }
  return null;
}

function controler() {
  const ecarts = [];
  const empreintes = {};

  for (const fichier of DOSSIERS_PILOT.flatMap(lister).filter((f) => f !== SOI)) {
    const brut = readFileSync(join(RACINE, fichier), "utf8");
    const code = sansCommentaires(brut);

    // R1
    for (const spec of specificateurs(code)) {
      const paquet = spec.split("/")[0];
      if (PAQUETS_INTERDITS.includes(paquet)) {
        ecarts.push(`R1 ${fichier} : importe « ${spec} », le pool pg est interdit à Pilot`);
        continue;
      }
      const c = cible(fichier, spec);
      if (!c || estPilot(c.chemin) || !c.alias) continue;
      if (c.alias === "@/lib/db" || c.alias.startsWith("@/lib/db/")) {
        ecarts.push(`R1 ${fichier} : importe « ${spec} », le pool pg est interdit à Pilot`);
      } else if (!(c.alias in MODULES_PERMIS)) {
        ecarts.push(
          `R1 ${fichier} : importe « ${c.alias} », absent de MODULES_PERMIS (scripts/pilot/controle-frontiere.mjs). ` +
            `L'y ajouter avec une phrase qui dit pourquoi il ne mène à aucune donnée patient.`
        );
      }
    }

    // R2
    const lues = [];
    for (const [table, accesseur] of Object.entries(TABLES_PATIENT)) {
      const sql = new RegExp(`"${table}"`);
      const orm = accesseur ? new RegExp(`\\.${accesseur}\\s*\\.\\s*(?:${METHODES_PRISMA})\\b`) : null;
      if (sql.test(code) || (orm && orm.test(code))) lues.push(table);
    }
    if (lues.length) {
      const permis = LECTURES_PERMISES[fichier];
      const hors = lues.filter((t) => !permis?.tables.includes(t));
      if (hors.length) {
        ecarts.push(`R2 ${fichier} : lit ${hors.join(", ")}, table(s) patient interdite(s) à Pilot`);
      }
    }
    if (LECTURES_PERMISES[fichier]) {
      const e = empreinte(brut);
      empreintes[fichier] = e;
      if (LECTURES_PERMISES[fichier].empreinte !== e) {
        ecarts.push(
          `R2 ${fichier} : a changé (empreinte ${e}) et lit une table patient. Relire ce qu'il en sort ` +
            `(des comptes seulement), puis recopier l'empreinte dans LECTURES_PERMISES.`
        );
      }
    }
  }
  for (const fichier of Object.keys(LECTURES_PERMISES)) {
    if (!(fichier in empreintes)) ecarts.push(`R2 ${fichier} : déclaré dans LECTURES_PERMISES mais introuvable`);
  }

  // R3
  for (const fichier of lister("src").filter((f) => !estPilot(f))) {
    const code = sansCommentaires(readFileSync(join(RACINE, fichier), "utf8"));
    for (const spec of specificateurs(code)) {
      const c = cible(fichier, spec);
      if (!c || !estPilot(c.chemin)) continue;
      if (!(fichier in IMPORTEURS_PERMIS)) {
        ecarts.push(
          `R3 ${fichier} : importe Pilot (« ${spec} »). Le Dashboard ne dépend pas de Pilot, ` +
            `sauf depuis IMPORTEURS_PERMIS (scripts/pilot/controle-frontiere.mjs).`
        );
      }
    }
  }

  return { ecarts, empreintes };
}

const { ecarts, empreintes } = controler();
if (process.argv.includes("--empreintes")) {
  for (const [fichier, e] of Object.entries(empreintes)) console.log(`${fichier}  ${e}`);
}
if (ecarts.length) {
  console.error(`Frontière Pilot / Dashboard : ${ecarts.length} écart(s)`);
  for (const e of ecarts) console.error("  - " + e);
  process.exit(1);
}
console.log("Frontière Pilot / Dashboard : aucun écart");

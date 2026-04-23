import { PrismaClient, CallIntent, CallStatus } from "@prisma/client";

const prisma = new PrismaClient();

/* =========================
   -------- CONFIG ---------
   ========================= */

const DAYS = 30;            // nombre de jours à générer (J-29 … J)
const MIN_PER_DAY = 100;    // borne basse d'appels / jour (avant pondération)
const MAX_PER_DAY = 150;    // borne haute d'appels / jour (avant pondération)

/**
 * Ciblage des utilisateurs :
 * - DEMO_TALK_USER_IDS="3,4,5" pour cibler plusieurs ids
 * - DEMO_TALK_USER_ID="3" pour un seul id
 * - sinon : premier user avec role=CLIENT
 */
const TARGET_USER_IDS: number[] | undefined = process.env.DEMO_TALK_USER_IDS
  ? process.env.DEMO_TALK_USER_IDS.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n))
  : process.env.DEMO_TALK_USER_ID
  ? [Number(process.env.DEMO_TALK_USER_ID)]
  : undefined;

/**
 * Fourchettes aléatoires par jour (0=dimanche … 6=samedi)
 * minMul/maxMul = multiplicateurs appliqués à MIN/MAX_PER_DAY.
 * -> On tire AU HASARD un facteur entre minMul et maxMul pour chaque jour.
 */
type Band = { minMul: number; maxMul: number };
const WEEKDAY_BANDS: Record<number, Band> = {
  0: { minMul: 0.05, maxMul: 0.15 }, // Dimanche : très peu
  1: { minMul: 1.40, maxMul: 1.70 }, // Lundi : plus
  2: { minMul: 0.90, maxMul: 1.10 }, // Mardi : normal
  3: { minMul: 1.20, maxMul: 1.50 }, // Mercredi : plus
  4: { minMul: 1.20, maxMul: 1.50 }, // Jeudi : plus
  5: { minMul: 0.90, maxMul: 1.10 }, // Vendredi : normal
  6: { minMul: 0.10, maxMul: 0.25 }, // Samedi : très peu
};

/** Répartition des intentions (doit totaliser 1) */
const INTENT_DISTRIBUTION: Array<[CallIntent, number]> = [
  [CallIntent.RDV, 0.55],
  [CallIntent.INFO, 0.20],
  [CallIntent.URGENCE, 0.10],
  [CallIntent.ANNULATION, 0.10],
  [CallIntent.CONSULTATION, 0.05],
];

/** Pondération horaires (6h→21h) : pics 12–14 & 16–18 */
const HOUR_WEIGHTS: Record<number, number> = (() => {
  const base: Record<number, number> = {};
  for (let h = 0; h < 24; h++) base[h] = 0; // inactif par défaut
  for (let h = 6; h <= 21; h++) base[h] = 1; // plage active
  base[6] = 0.6; base[7] = 0.7; base[8] = 0.8;
  base[12] = 2.5; base[13] = 2.5;             // pic midi
  base[16] = 2.2; base[17] = 2.2;             // pic fin aprem
  base[20] = 0.8; base[21] = 0.7;
  return base;
})();

/* =========================
   -------- LOGIQUE --------
   ========================= */

/** Durées typiques par intention (secondes) */
function sampleDurationSec(intent: CallIntent): number {
  switch (intent) {
    case "RDV":          return randInt(120, 320);
    case "INFO":         return randInt(60, 180);
    case "URGENCE":      return randInt(30, 60);
    case "ANNULATION":   return randInt(30, 120);
    case "CONSULTATION": return randInt(45, 150);
    default:             return randInt(60, 240);
  }
}

/** Steps par intention (pour affichage) */
function stepsFor(intent: CallIntent): string[] {
  switch (intent) {
    case "RDV":          return ["Identification", "Type d’examen", "Créneau"];
    case "URGENCE":      return ["Identification"];
    case "ANNULATION":   return ["Identification", "Annulation"];
    case "CONSULTATION": return ["Identification", "Consultation"];
    case "INFO":         return [];
    default:             return [];
  }
}

/** Mapping “display string” pour compatibilité avec l’existant */
function intentDisplay(intent: CallIntent): string {
  switch (intent) {
    case "RDV":          return "prise de rdv";
    case "INFO":         return "info";
    case "URGENCE":      return "urgence";
    case "ANNULATION":   return "annulation";
    case "CONSULTATION": return "consultation";
  }
}

/** Choix d'une heure pondérée */
function pickWeightedHour(): number {
  const hours = Object.keys(HOUR_WEIGHTS).map(Number);
  const weights = hours.map((h) => HOUR_WEIGHTS[h]);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < hours.length; i++) {
    r -= weights[i];
    if (r <= 0) return hours[i];
  }
  return 12;
}

/** Nombre d'appels par jour via fourchette aléatoire par jour de semaine */
function callsPerDay(d: Date): number {
  const band = WEEKDAY_BANDS[d.getDay()] ?? { minMul: 1, maxMul: 1 };
  // Tirage aléatoire d’un multiplicateur dans la fourchette du jour
  const mul = band.minMul + Math.random() * (band.maxMul - band.minMul);
  // On dérive ensuite des bornes min/max spécifiques au jour
  const min = Math.max(0, Math.round(MIN_PER_DAY * mul));
  const max = Math.max(min, Math.round(MAX_PER_DAY * mul));
  // Et on tire le volume du jour dans [min, max]
  return randInt(min, max);
}

/** Utils */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function pickIntent(): CallIntent {
  const r = Math.random();
  let acc = 0;
  for (const [intent, p] of INTENT_DISTRIBUTION) {
    acc += p;
    if (r <= acc) return intent;
  }
  return INTENT_DISTRIBUTION[INTENT_DISTRIBUTION.length - 1][0];
}

/* =========================
   ------ GÉNÉRATION -------
   ========================= */

const FIRSTNAMES = ["Marie", "Lucas", "Chloé", "Enzo", "Léa", "Hugo", "Manon", "Nina", "Paul", "Zoé"];
const LASTNAMES  = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau"];

function randomPhoneFRMobile() {
  // 06 / 07 + 8 chiffres
  const prefix = Math.random() < 0.5 ? "06" : "07";
  let rest = "";
  for (let i = 0; i < 8; i++) rest += randInt(0, 9).toString();
  return prefix + rest;
}

function randomBirthdate() {
  const year = randInt(1950, 2010);
  const month = randInt(0, 11);
  const day = randInt(1, 28);
  return new Date(Date.UTC(year, month, day));
}

/* =========================
   -------- SEEDING --------
   ========================= */

async function seedForUser(userId: number) {
  // Numéro "called" du centre (si renseigné), sinon fallback
  const num = await prisma.userNumber.findFirst({ where: { userId } });
  const calledNumber = num?.number ?? "0140000000";

  // Optionnel : nettoyer la période (évite doublons sur la fenêtre des N jours)
  const since = new Date();
  since.setDate(since.getDate() - (DAYS + 1));
  await prisma.call.deleteMany({
    where: { userId, createdAt: { gte: since } },
  });

  const now = new Date();
  console.log(`Seeding ${DAYS} jours pour userId=${userId} …`);

  for (let back = DAYS - 1; back >= 0; back--) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - back);

    const nCalls = callsPerDay(day);

    // Batch insert pour perf
    const batch: any[] = [];

    for (let i = 0; i < nCalls; i++) {
      const h = pickWeightedHour();
      const m = randInt(0, 59);
      const s = randInt(0, 59);

      const createdAt = new Date(day);
      createdAt.setHours(h, m, s, 0);

      const intentCode = pickIntent();
      const durationSec = sampleDurationSec(intentCode);
      const status: CallStatus = "COMPLETED";

      const firstname = sample(FIRSTNAMES);
      const lastname  = sample(LASTNAMES);

      batch.push({
        userId,
        caller: randomPhoneFRMobile(),
        called: calledNumber,

        // legacy + normalized
        intent: intentDisplay(intentCode),
        intentCode,
        status,
        durationSec,

        firstname,
        lastname,
        birthdate: randomBirthdate(),
        createdAt,
        steps: stepsFor(intentCode),
      });
    }

    await prisma.call.createMany({ data: batch });
    console.log(`${createdAtISO(day)} - ${nCalls} appels`);
  }

  console.log(`✅ Seed terminé pour userId=${userId}.`);
}

function createdAtISO(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

/* =========================
   ---------- MAIN ---------
   ========================= */

async function main() {
  let userIds: number[] = [];

  if (TARGET_USER_IDS?.length) {
    const users = await prisma.user.findMany({ where: { id: { in: TARGET_USER_IDS } } });
    if (!users.length) throw new Error("Aucun user trouvé pour DEMO_TALK_USER_IDS.");
    userIds = users.map((u) => u.id);
  } else {
    // Fallback : 1er user CLIENT trouvé
    const u = await prisma.user.findFirst({ where: { role: "CLIENT" } });
    if (!u) throw new Error("Aucun user CLIENT trouvé. Renseigne DEMO_TALK_USER_ID(S).");
    userIds = [u.id];
  }

  for (const uid of userIds) {
    await seedForUser(uid);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

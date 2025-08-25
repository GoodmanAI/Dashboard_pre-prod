// prisma/seed_calls.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_USERS = [
  { email: 'compte_centre1@mail.fr', password: '1234' },
  { email: 'compte_centre2@mail.fr', password: '1234' },
  { email: 'compte_centre3@mail.fr', password: '1234' },
];

const FIRST_NAMES = [
  'Alice','Bob','Charlie','David','Eva','François','Gabrielle','Hugo','Isabelle','Julien',
  'Karine','Loïc','Marie','Nathan','Océane','Paul','Quentin','Romain','Sophie','Théo'
];

const LAST_NAMES = [
  'Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
  'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier'
];

const INTENTS = ['info','prise de rdv','urgence'] as const;

function randomDateBetween(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPhone(): string {
  const n = Math.floor(Math.random() * 1e9).toString().padStart(9, '0');
  return '+33' + n;
}

async function main() {
  // Récupère les utilisateurs par email
  const users = await prisma.user.findMany({
    where: { email: { in: TARGET_USERS.map(u => u.email) } }
  });

  if (users.length !== TARGET_USERS.length) {
    console.error('⚠️ Certains comptes centre n’ont pas été trouvés en base :', TARGET_USERS.map(u => u.email));
    process.exit(1);
  }

  // Date fixe : 02 août 2025
  const baseDate = new Date('2025-08-02T00:00:00Z');

  // Nombre total d’appels ~100, on divise par le nombre d’utilisateurs
  const totalCalls = 100;
  const perUser = Math.ceil(totalCalls / users.length);

  for (const user of users) {
    for (let i = 0; i < perUser; i++) {
      const caller    = randomPhone();
      const called    = randomPhone();
      const intent    = INTENTS[Math.floor(Math.random() * INTENTS.length)];
      const firstname = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const lastname  = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const birthdate = randomDateBetween(new Date(1950,0,1), new Date(2005,11,31));
      const createdAt = new Date(baseDate.getTime() + Math.random() * 24 * 3600 * 1000);
      const steps     = ['step1','step2','step3'];

      await prisma.call.create({
        data: {
          userId:      user.id,
          createdById: user.id,
          caller,
          called,
          intent,
          firstname,
          lastname,
          birthdate,
          createdAt,
          steps,
        },
      });
    }
  }

  console.log(`✅ Environ ${perUser * users.length} appels semés pour les 3 centres.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

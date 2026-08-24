// prisma/seed.ts
import { PrismaClient, TicketStatus, User, Product } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
// Chemin RELATIF et non l'alias `@/` : ce fichier est exécuté par ts-node, qui
// ne résout pas les `paths` du tsconfig (`tsconfig-paths` n'est pas installé).
import { PRODUITS } from '../src/lib/produits'

const prisma = new PrismaClient()

// ----------------------------------------
//  Variables de configuration en dur
// ----------------------------------------
const SUPER_ADMIN_EMAIL: string    = process.env.ADMIN_EMAIL ?? 'admin@default.com'
const SUPER_ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD ?? 'secret123'

const DIRECTOR_EMAIL: string       = 'compte_dg@mail.fr'
const DIRECTOR_PASSWORD: string    = '1234'

const CENTRE_CREDENTIALS: { email: string; password: string, name?: string }[] = [
  { email: 'compte_centre1@mail.fr', password: '1234' },
  { email: 'compte_centre2@mail.fr', password: '1234' },
  { email: 'compte_centre3@mail.fr', password: '1234' },
  { email: 'lecreusot@mail.fr', password: 'lyraetalk', name: "Montchanin - Le Creusot"}
]

// Dates, statuts & intents
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}
const ticketStatuses: TicketStatus[] = ['PENDING', 'IN_PROGRESS', 'CLOSED']
const callIntents: string[]           = ['info', 'support', 'sales']

async function main(): Promise<void> {
  // 1. Super-admin
  const hashedSuperPw = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10)
  const superAdmin: User = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      password: hashedSuperPw,
      role: 'ADMIN'
    }
  })

  // 2. Produits
  //
  // LyraeExplain n'est plus créé : le produit est retiré du dashboard. Les
  // lignes existantes en base ne sont PAS supprimées ici — un DELETE sur
  // "Product" cascade sur "UserProduct" et sur tout ce qui y pend.
  //
  // LyraeKonnect vient du référentiel `src/lib/produits.ts`, seul endroit qui
  // connaît les valeurs de `Product.name`. La même insertion existe en SQL
  // idempotent dans `prisma/migrations/manual/2026_08_24_add_produit_konnect.sql`,
  // pour les bases où le seed ne tourne pas (prod).
  await prisma.product.createMany({
    data: [
      { name: PRODUITS.talk.nom,    description: 'Robot vocal téléphonique' },
      { name: PRODUITS.konnect.nom, description: 'Portail patient web de prise de rendez-vous' }
    ],
    skipDuplicates: true
  })
  const lyraeTalk: Product = await prisma.product.findFirstOrThrow({ where: { name: PRODUITS.talk.nom } })

  // 3. Admin_user (Directeur)
  const hashedDirectorPw = await bcrypt.hash(DIRECTOR_PASSWORD, 10)
  const clientAdmin: User = await prisma.user.upsert({
    where: { email: DIRECTOR_EMAIL },
    update: {},
    create: {
      name: 'DG Vannes',
      email: DIRECTOR_EMAIL,
      password: hashedDirectorPw,
      role: 'CLIENT' as const,
      centreRole: 'ADMIN_USER' as const,
      address: '1 Place de Vannes',
      city: 'Vannes',
      postalCode: '56000',
      country: 'France'
    }
  })

  
  // 4. Centres (sub-users)
  const centreUsers: User[] = []
  for (const cred of CENTRE_CREDENTIALS) {
    const hashedPw = await bcrypt.hash(cred.password, 10)
    const centre = await prisma.user.upsert({
      where: { email: cred.email },
      update: {},
      create: {
        name: cred.name ? cred.name : `Centre ${CENTRE_CREDENTIALS.indexOf(cred) + 1}`,
        email: cred.email,
        password: hashedPw,
        role: 'CLIENT' as const,
        centreRole: 'USER' as const,
        address: `${CENTRE_CREDENTIALS.indexOf(cred) + 1} rue de Bretagne`,
        city: 'Vannes',
        postalCode: `5600${CENTRE_CREDENTIALS.indexOf(cred) + 1}`,
        country: 'France',
        manager: { connect: { id: clientAdmin.id } }
      }
    })
    centreUsers.push(centre)
  }

  // 5. Assignation du produit LyraeTalk
  //
  // LyraeKonnect n'est PAS assigné automatiquement : le rattachement d'un
  // centre au portail patient suppose une correspondance `tenantId` côté
  // Konnect (voir `KonnectTenantMapping`), qui n'a rien à voir avec un jeu de
  // démo. Il se fait depuis l'admin, centre par centre.
  console.log("centreUsers", centreUsers)
  for (const centre of centreUsers) {
    await prisma.userProduct.upsert({
      where: { userId_productId: { userId: centre.id, productId: lyraeTalk.id } },
      update: {},
      create: { userId: centre.id, productId: lyraeTalk.id },
    })
  }

  // 6. Tickets aléatoires (2-3 par centre)
  for (const centre of centreUsers) {
    const count = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < count; i++) {
      await prisma.ticket.create({
        data: {
          userId:      centre.id,
          createdById: clientAdmin.id,
          subject:     `Sujet ticket #${i + 1} pour ${centre.name}`,
          message:     `Message seed ${randomUUID()}`,
          status:      ticketStatuses[Math.floor(Math.random() * ticketStatuses.length)],
          createdAt:   randomDate(new Date(2025, 0, 1), new Date())
        }
      })
    }
  }

  // 7. Appels aléatoires (10 par centre)
  for (const centre of centreUsers) {
    for (let j = 0; j < 10; j++) {
      await prisma.call.create({
        data: {
          userId:      centre.id,
          createdById: centre.id,
          caller:      `+33${Math.floor(600000000 + Math.random() * 400000000)}`,
          called:      `+33${Math.floor(600000000 + Math.random() * 400000000)}`,
          intent:      callIntents[Math.floor(Math.random() * callIntents.length)],
          firstname:   `Prenom${j + 1}`,
          lastname:    `Nom${j + 1}`,
          birthdate:   randomDate(new Date(1950, 0, 1), new Date(2000, 0, 1)),
          createdAt:   randomDate(new Date(2025, 0, 1), new Date()),
          steps:       ['step1', 'step2', 'step3']
        }
      })
    }
  }

  console.log('⭐️ Seed mis à jour et exécuté avec succès!')
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

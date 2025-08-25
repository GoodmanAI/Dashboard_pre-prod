// prisma/seed.ts
import { PrismaClient, TicketStatus, User, Product } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// ----------------------------------------
//  Variables de configuration en dur
// ----------------------------------------
const SUPER_ADMIN_EMAIL: string    = process.env.ADMIN_EMAIL ?? 'admin@default.com'
const SUPER_ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD ?? 'secret123'

const DIRECTOR_EMAIL: string       = 'compte_dg@mail.fr'
const DIRECTOR_PASSWORD: string    = '1234'

const CENTRE_CREDENTIALS: { email: string; password: string }[] = [
  { email: 'compte_centre1@mail.fr', password: '1234' },
  { email: 'compte_centre2@mail.fr', password: '1234' },
  { email: 'compte_centre3@mail.fr', password: '1234' }
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
  await prisma.product.createMany({
    data: [
      { name: 'LyraeExplain', description: 'Produit Lyrae Explain' },
      { name: 'LyraeTalk',    description: 'Produit Lyrae Talk' }
    ],
    skipDuplicates: true
  })
  const lyraeExplain: Product = await prisma.product.findFirstOrThrow({ where: { name: 'LyraeExplain' } })
  const lyraeTalk:    Product = await prisma.product.findFirstOrThrow({ where: { name: 'LyraeTalk'    } })

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
        name: `Centre ${CENTRE_CREDENTIALS.indexOf(cred) + 1}`,
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

  // 5. Assignation des deux produits & détails pour LyraeExplain
  for (const centre of centreUsers) {
    const upExplain = await prisma.userProduct.upsert({
      where: { userId_productId: { userId: centre.id, productId: lyraeExplain.id } },
      update: {},
      create: { userId: centre.id, productId: lyraeExplain.id }
    })
    const upTalk = await prisma.userProduct.upsert({
      where: { userId_productId: { userId: centre.id, productId: lyraeTalk.id } },
      update: {},
      create: { userId: centre.id, productId: lyraeTalk.id }
    })
    await prisma.lyraeExplainDetails.upsert({
      where: { userProductId: upExplain.id },
      update: {},
      create: {
        userProductId: upExplain.id,
        rdv:         Math.floor(Math.random() * 101),
        borne:       Math.floor(Math.random() * 101),
        examen:      Math.floor(Math.random() * 101),
        secretaire:  Math.floor(Math.random() * 101),
        attente:     Math.floor(Math.random() * 101)
      }
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

// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcrypt';

// const prisma = new PrismaClient();

// async function main() {

//     const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@default.com';
//     const adminPassword = process.env.ADMIN_PASSWORD ?? 'secret123';
//     const hashedPassword = await bcrypt.hash(adminPassword, 10);

//     await prisma.user.upsert({
//       where: { email: adminEmail },
//       update: {},
//       create: {
//         email: adminEmail,
//         password: hashedPassword,
//         role: "ADMIN",
//         name: "Administrator",
//       },
//     });


//   await prisma.product.createMany({
//     data: [
//       { name: "LyraeExplain", description: "Produit Lyrae Explain" },
//       { name: "LyraeTalk", description: "Produit Lyrae Talk" },
//     ],
//     skipDuplicates: true,
//   });

//   console.log('Seed terminé avec succès!');
// }


// main()
//   .then(async () => {
//     await prisma.$disconnect();
//   })
//   .catch(async (e) => {
//     console.error(e);
//     await prisma.$disconnect();
//     process.exit(1);
//   });

// import prisma from "../src/utils/prisma";
// import bcrypt from "bcrypt";

// async function seedLocalTest() {
//   console.log("🌱 Seeding local test data...");

//   try {
//     // Récupère tous les produits existants
//     const products = await prisma.product.findMany();

//     if (products.length === 0) {
//       console.error("❌ No products found in the database. Please add products first.");
//       return;
//     }

//     const numUsers = 10; // Nombre d'utilisateurs à créer
//     const users = [];

//     for (let i = 1; i <= numUsers; i++) {
//       const email = `testuser${i}@mail.com`;
//       const name = `Test User ${i}`;
//       const password = await bcrypt.hash("TestPassword123!", 10);

//       const newUser = await prisma.user.create({
//         data: {
//           email,
//           password,
//           name,
//           role: "CLIENT",
//         },
//       });

//       console.log(`✅ Created user: ${newUser.name} (${newUser.email})`);
//       users.push(newUser);
//     }

//     const userProductRelations = [];

//     for (const user of users) {
//       const assignedProducts = getRandomProducts(products, 2, 5); // Chaque utilisateur aura 2 à 5 produits affiliés
//       for (const product of assignedProducts) {
//         const assignedAt = getRandomDate();

//         const userProduct = await prisma.userProduct.create({
//           data: {
//             userId: user.id,
//             productId: product.id,
//             assignedAt,
//           },
//         });

//         console.log(`🔗 Assigned ${product.name} to ${user.name} on ${assignedAt.toISOString()}`);
//         userProductRelations.push(userProduct);
//       }
//     }

//     console.log("🎉 Seeding completed successfully!");
//   } catch (error) {
//     console.error("❌ Error seeding local test data:", error);
//   } finally {
//     await prisma.$disconnect();
//   }
// }

// // Génère une liste aléatoire de produits (2 à 5 produits par utilisateur)
// function getRandomProducts(products: any[], min: number, max: number) {
//   const shuffled = [...products].sort(() => 0.5 - Math.random());
//   const count = Math.floor(Math.random() * (max - min + 1)) + min;
//   return shuffled.slice(0, count);
// }

// // Génère une date aléatoire entre il y a 3 mois et aujourd'hui
// function getRandomDate() {
//   const now = new Date();
//   const threeMonthsAgo = new Date();
//   threeMonthsAgo.setMonth(now.getMonth() - 3);

//   const randomTime = threeMonthsAgo.getTime() + Math.random() * (now.getTime() - threeMonthsAgo.getTime());
//   return new Date(randomTime);
// }

// // Exécute le script de seed
// seedLocalTest();

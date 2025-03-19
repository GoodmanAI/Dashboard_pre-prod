// import prisma from "../src/utils/prisma";
// import bcrypt from "bcrypt";
// import fs from "fs/promises";
// import path from "path";

// function getRandomInt(min: number, max: number) {
//   return Math.floor(Math.random() * (max - min + 1)) + min;
// }

// async function seedClients() {
//   console.log("🌱 Seeding client accounts...");

//   const numClients = 30;
//   for (let i = 1; i <= numClients; i++) {
//     const email = `client${i}@example.com`;
//     const name = `Client ${i}`;
//     const password = await bcrypt.hash("ClientPassword123!", 10);

//     // Création du compte client
//     const client = await prisma.user.create({
//       data: {
//         email,
//         name,
//         password,
//         role: "CLIENT",
//       },
//     });
//     console.log(`✅ Created client: ${client.email}`);

//     const assignExplain = Math.random() < 0.7; // 70% de chances d'avoir LyraeExplain
//     const assignTalk = Math.random() < 0.7;    // 70% de chances d'avoir LyraeTalk

//     if (assignExplain) {
//       await prisma.userProduct.create({
//         data: {
//           userId: client.id,
//           productId: 1, // LyraeExplain
//           assignedAt: new Date(),
//           explainDetails: {
//             create: {
//               rdv: null,
//               borne: null,
//               examen: null,
//               secretaire: null,
//               attente: null,
//               metricsUpdatedAt: null,
//             },
//           },
//         },
//       });
//       console.log(`🔗 Assigned product LyraeExplain to ${client.email}`);
//     }

//     if (assignTalk) {
//       await prisma.userProduct.create({
//         data: {
//           userId: client.id,
//           productId: 2, // LyraeTalk
//           assignedAt: new Date(),
//           talkDetails: {
//             create: {
//               talkInfoValidated: false,
//               talkLibelesValidated: false,
//             },
//           },
//         },
//       });
//       console.log(`🔗 Assigned product LyraeTalk to ${client.email}`);

//       const uploadsDir = path.join(process.cwd(), "public", "upload");
//       await fs.mkdir(uploadsDir, { recursive: true });

//       // Définir les noms de fichiers
//       const talkInfoFileName = `talkInfo-${client.name}.csv`;
//       const talkLibelesFileName = `talkLibeles-${client.name}.csv`;
//       const talkInfoFilePath = path.join(uploadsDir, talkInfoFileName);
//       const talkLibelesFilePath = path.join(uploadsDir, talkLibelesFileName);

//       // Chemin des templates
//       const templateDir = path.join(process.cwd(), "public", "upload", "template");
//       const talkInfoTemplatePath = path.join(templateDir, "talkInfo-template.csv");
//       const talkLibelesTemplatePath = path.join(templateDir, "talkLibeles-template.csv");

//       // Copie des templates
//       await fs.copyFile(talkInfoTemplatePath, talkInfoFilePath);
//       await fs.copyFile(talkLibelesTemplatePath, talkLibelesFilePath);

//       await prisma.fileSubmission.createMany({
//         data: [
//           {
//             userId: client.id,
//             productId: 2,
//             fileName: talkInfoFileName,
//             fileUrl: `/upload/${talkInfoFileName}`,
//           },
//           {
//             userId: client.id,
//             productId: 2,
//             fileName: talkLibelesFileName,
//             fileUrl: `/upload/${talkLibelesFileName}`,
//           },
//         ],
//       });
//       console.log(`📄 Created CSV files for ${client.email}`);
//     }
//   }
// }

// seedClients()
//   .then(() => {
//     console.log("🎉 Client seeding completed.");
//     prisma.$disconnect();
//   })
//   .catch((error) => {
//     console.error("❌ Error seeding clients:", error);
//     prisma.$disconnect();
//   });

import prisma from "../src/utils/prisma";
import bcrypt from "bcrypt";

async function seedAdmin() {
  console.log("🌱 Seeding admin and products...");

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@default.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  let admin;
  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'secret123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        password: hashedPassword,
        role: "ADMIN",
      },
    });
    console.log(`✅ Admin created: ${admin.email}`);
  } else {
    admin = existingAdmin;
    console.log(`⚠️ Admin already exists: ${admin.email}`);
  }

  // Création des produits
  const productsToCreate = [
    { name: "LyraeExplain", description: "Produit Lyrae Explain" },
    { name: "LyraeTalk", description: "Produit Lyrae Talk" },
  ];

  for (const prodData of productsToCreate) {
    const existingProduct = await prisma.product.findFirst({ where: { name: prodData.name } });
    if (!existingProduct) {
      const product = await prisma.product.create({ data: prodData });
      console.log(`✅ Product created: ${product.name}`);
    } else {
      console.log(`⚠️ Product already exists: ${existingProduct.name}`);
    }
  }
}

seedAdmin()
  .then(() => {
    console.log("🎉 Admin and products seeding completed.");
    prisma.$disconnect();
  })
  .catch((error) => {
    console.error("❌ Error seeding admin:", error);
    prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@neuracorp.ai";
  const password = "Admin123!";
  const hashed = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("⚠️ Admin existe déjà");
    return;
  }

  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      password: hashed,
      role: "ADMIN",
      centreRole: "ADMIN_USER",
    },
  });

  console.log("✅ Admin créé :", email, "/", password);
}

main().finally(() => prisma.$disconnect());

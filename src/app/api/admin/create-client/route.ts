// src/app/api/admin/create-client/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[@$!%*?&]/, "Password must contain at least one special character"),
  name: z.string().min(1, "Name is required"),
  products: z
    .array(
      z.object({
        productId: z.number(),
        assignedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
          message: "Invalid date format",
        }),
      })
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier que la session correspond à un admin
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can create clients." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = CreateUserSchema.safeParse(body);
    if (!parseResult.success) {
      const validationErrors = parseResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 }
      );
    }

    const { email, password, name, products } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    // Vérifier si un utilisateur avec cet email ou nom existe déjà
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { name }],
      },
    });
    if (existingUser) {
      const duplicateField =
        existingUser.email === normalizedEmail ? "email" : "name";
      return NextResponse.json(
        {
          error: `A user with this ${duplicateField} already exists.`,
          details: [
            {
              field: duplicateField,
              message: `${duplicateField} is already in use.`,
            },
          ],
        },
        { status: 409 }
      );
    }

    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Création du client
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        role: "CLIENT",
      },
    });

    // Associer les produits si fournis
    let selectedProductIds: number[] = [];
    if (products && products.length > 0) {
      selectedProductIds = products.map((p) => p.productId);
      const existingProducts = await prisma.product.findMany({
        where: { id: { in: selectedProductIds } },
      });
      if (existingProducts.length !== products.length) {
        return NextResponse.json(
          { error: "Some of the provided product IDs do not exist." },
          { status: 400 }
        );
      }
      await prisma.userProduct.createMany({
        data: products.map(({ productId, assignedAt }) => ({
          userId: newUser.id,
          productId,
          assignedAt: new Date(assignedAt),
        })),
      });
    }

    // Récupérer les IDs des produits Explain/Talk (évite les magic numbers 1/2)
    const coreProducts = await prisma.product.findMany({
      where: {
        name: { in: ["LyraeExplain", "LyraeTalk"] },
      },
      select: { id: true, name: true },
    });
    const explainProduct = coreProducts.find(
      (p) => p.name.toLowerCase() === "lyraeexplain".toLowerCase()
    );
    const talkProduct = coreProducts.find(
      (p) => p.name.toLowerCase() === "LyraeTalk".toLowerCase()
    );

    // === LyraeExplain ===
    if (explainProduct && selectedProductIds.includes(explainProduct.id)) {
      const userProductExplain = await prisma.userProduct.findFirst({
        where: { userId: newUser.id, productId: explainProduct.id },
      });
      if (userProductExplain) {
        // IMPORTANT : avec le nouveau schéma, on NE crée pas rdv/borne/etc.
        // On crée un enregistrement vide (JSON par défaut "[]")
        await prisma.lyraeExplainDetails.upsert({
          where: { userProductId: userProductExplain.id },
          update: {},
          create: { userProductId: userProductExplain.id },
        });
      }
    }

    // === LyraeTalk ===
    if (talkProduct && selectedProductIds.includes(talkProduct.id)) {
      const uploadsDir = path.join(process.cwd(), "public", "upload");
      await fs.mkdir(uploadsDir, { recursive: true });

      const talkInfoFileName = `talkInfo-${newUser.name}.csv`;
      const talkLibelesFileName = `talkLibeles-${newUser.name}.csv`;
      const talkInfoFilePath = path.join(uploadsDir, talkInfoFileName);
      const talkLibelesFilePath = path.join(uploadsDir, talkLibelesFileName);

      const templateDir = path.join(process.cwd(), "public", "upload", "template");
      const talkInfoTemplatePath = path.join(templateDir, "talkInfo-template.csv");
      const talkLibelesTemplatePath = path.join(templateDir, "talkLibeles-template.csv");

      // Copie les templates si présents (sinon lève une erreur)
      await fs.copyFile(talkInfoTemplatePath, talkInfoFilePath);
      await fs.copyFile(talkLibelesTemplatePath, talkLibelesFilePath);

      // Ensure UserProduct Talk
      const userProductTalk = await prisma.userProduct.upsert({
        where: { userId_productId: { userId: newUser.id, productId: talkProduct.id } },
        update: {},
        create: { userId: newUser.id, productId: talkProduct.id, assignedAt: new Date() },
      });

      // Talk details par défaut
      await prisma.lyraeTalkDetails.upsert({
        where: { userProductId: userProductTalk.id },
        update: {},
        create: {
          userProductId: userProductTalk.id,
          talkInfoValidated: false,
          talkLibelesValidated: false,
        },
      });

      // Historique des fichiers liés
      await prisma.fileSubmission.createMany({
        data: [
          {
            userId: newUser.id,
            productId: talkProduct.id,
            fileName: talkInfoFileName,
            fileUrl: `/upload/${talkInfoFileName}`,
          },
          {
            userId: newUser.id,
            productId: talkProduct.id,
            fileName: talkLibelesFileName,
            fileUrl: `/upload/${talkLibelesFileName}`,
          },
        ],
      });
    }

    return NextResponse.json(
      { message: "Client created successfully", user: newUser },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

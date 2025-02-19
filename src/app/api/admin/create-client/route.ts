// src/app/api/admin/create-client/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// Schéma de validation mis à jour pour inclure "assignedAt"
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

    // Vérifier si un utilisateur avec cet email ou nom existe déjà
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase() }, { name }],
      },
    });
    if (existingUser) {
      const duplicateField =
        existingUser.email === email.toLowerCase() ? "email" : "name";
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
        email,
        password: hashedPassword,
        name,
        role: "CLIENT",
      },
    });

    // Associer les produits si fournis
    if (products && products.length > 0) {
      const existingProducts = await prisma.product.findMany({
        where: { id: { in: products.map((p) => p.productId) } },
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

    // Pour le produit LyraeExplain (id = 1)
    const hasExplainProduct = products?.some((p) => p.productId === 1);
    if (hasExplainProduct) {
      const userProductExplain = await prisma.userProduct.findFirst({
        where: { userId: newUser.id, productId: 1 },
      });
      if (userProductExplain) {
        // Créer l'enregistrement dans LyraeExplainDetails avec des valeurs par défaut (null)
        await prisma.lyraeExplainDetails.create({
          data: {
            userProductId: userProductExplain.id,
            rdv: null,
            borne: null,
            examen: null,
            secretaire: null,
            attente: null,
            metricsUpdatedAt: null,
          },
        });
      }
    }

    // Pour le produit LyraeTalk (id = 2)
    const hasTalkProduct = products?.some((p) => p.productId === 2);
    if (hasTalkProduct) {
      // On vérifie que le produit existe
      const talkProduct = await prisma.product.findUnique({ where: { id: 2 } });
      if (talkProduct) {
        const uploadsDir = path.join(process.cwd(), "public", "upload");
        await fs.mkdir(uploadsDir, { recursive: true });

        // Définir les noms des fichiers à créer
        const talkInfoFileName = `talkInfo-${newUser.name}.csv`;
        const talkLibelesFileName = `talkLibeles-${newUser.name}.csv`;
        const talkInfoFilePath = path.join(uploadsDir, talkInfoFileName);
        const talkLibelesFilePath = path.join(uploadsDir, talkLibelesFileName);

        // Chemin des templates (à placer dans public/upload/template)
        const templateDir = path.join(process.cwd(), "public", "upload", "template");
        const talkInfoTemplatePath = path.join(templateDir, "talkInfo-template.csv");
        const talkLibelesTemplatePath = path.join(templateDir, "talkLibeles-template.csv");

        // Copier les templates vers les nouveaux fichiers
        await fs.copyFile(talkInfoTemplatePath, talkInfoFilePath);
        await fs.copyFile(talkLibelesTemplatePath, talkLibelesFilePath);

        // Vérifier si une entrée UserProduct pour le produit LyraeTalk existe déjà
        let userProductTalk = await prisma.userProduct.findFirst({
          where: { userId: newUser.id, productId: 2 },
        });
        if (!userProductTalk) {
          userProductTalk = await prisma.userProduct.create({
            data: {
              userId: newUser.id,
              productId: 2,
              assignedAt: new Date(),
            },
          });
        }

        // Créer l'enregistrement dans LyraeTalkDetails avec des valeurs par défaut
        await prisma.lyraeTalkDetails.create({
          data: {
            userProductId: userProductTalk.id,
            talkInfoValidated: false,
            talkLibelesValidated: false,
          },
        });

        // Créer les enregistrements FileSubmission pour associer les fichiers à l'utilisateur et au produit
        await prisma.fileSubmission.createMany({
          data: [
            {
              userId: newUser.id,
              productId: 2,
              fileName: talkInfoFileName,
              fileUrl: `/upload/${talkInfoFileName}`,
            },
            {
              userId: newUser.id,
              productId: 2,
              fileName: talkLibelesFileName,
              fileUrl: `/upload/${talkLibelesFileName}`,
            },
          ],
        });
      }
    }

    return NextResponse.json(
      { message: "Client created successfully", user: newUser },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

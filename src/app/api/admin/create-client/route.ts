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
import { passwordSchema } from "@/lib/passwordSchema";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { NOMS_PRODUITS, estProduit } from "@/lib/produits";

const CreateUserSchema = z.object({
  // Historiquement nommé "email" mais c'est en fait un identifiant libre (peut
  // ne PAS contenir de @). On accepte n'importe quelle string >= 3 chars,
  // trim + lowercase systématique pour éviter les doublons de casse et pour
  // que le login match toujours (authorize() lookup en lowercase).
  email: z
    .string()
    .min(3, "Identifiant must be at least 3 characters")
    .transform((v) => v.trim().toLowerCase()),

  // Politique unifiée (cf. src/lib/passwordSchema.ts). Avant, ce endpoint
  // acceptait un mot de passe faible (juste 8 chars + une minuscule) alors que
  // le client ne pouvait ensuite pas le changer sans policy complète →
  // incohérence corrigée.
  password: passwordSchema,

  name: z.string().min(1, "Name is required"),

  isSecretary: z.boolean().optional(),

  // Chantier 2026-08-05 : multi-centres exposé dans l'UI create-client.
  // 3 modes possibles :
  //   - autonome (defaut) : centreRole=null, managerId=null (comportement historique)
  //   - manager multi-sites : centreRole='ADMIN_USER', managerId=null
  //     (le compte cree gerera d'autres centres via managerId inverse)
  //   - rattache : centreRole='USER', managerId=<id du compte parent CLIENT>
  centreRole: z.enum(["ADMIN_USER", "USER"]).nullable().optional(),
  managerId: z.number().int().positive().nullable().optional(),

  products: z
    .array(
      z.object({
        productId: z.number(),
        assignedAt: z.string().refine(
          (date) => !isNaN(Date.parse(date)),
          { message: "Invalid date format" }
        ),
      })
    )
    .optional(),
});


export async function POST(request: NextRequest) {
  try {
    // Vérifier que la session correspond à un admin
    const session = await getServerSession(authOptions);
    // Chantier 3 : creation de clients reservee au SUPER_ADMIN.
    // Les ADMIN ordinaires ont un role de support/consultation (tickets,
    // stats) mais ne peuvent pas provisionner de nouveaux comptes clients.
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only SUPER_ADMIN can create clients." },
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

    const {
      email,
      password,
      name,
      products,
      isSecretary,
      centreRole,
      managerId,
    } = parseResult.data;
    // Le schema Zod applique déjà trim + lowercase à `email` (cf. transform
    // ci-dessus). On garde le nom `normalizedEmail` pour ne pas toucher au
    // reste du fichier.
    const normalizedEmail = email;

    // Chantier 2026-08-05 : validations metier multi-centres
    //   - USER requiert un managerId (compte parent CLIENT existant)
    //   - ADMIN_USER n'accepte pas de managerId (c'est LUI le parent)
    //   - managerId doit pointer vers un CLIENT existant
    if (centreRole === "USER" && !managerId) {
      return NextResponse.json(
        { error: "managerId requis pour un compte USER (rattache a un parent)" },
        { status: 400 }
      );
    }
    if (centreRole === "ADMIN_USER" && managerId) {
      return NextResponse.json(
        { error: "managerId ne doit pas etre fourni pour un compte ADMIN_USER (c'est LUI le parent)" },
        { status: 400 }
      );
    }
    if (managerId) {
      const parent = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true, role: true },
      });
      if (!parent || parent.role !== "CLIENT") {
        return NextResponse.json(
          { error: "managerId invalide : le compte parent doit etre un CLIENT existant" },
          { status: 400 }
        );
      }
    }

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

    // Création du client (chantier 2026-08-05 : + centreRole + managerId
    // pour le rattachement multi-centres exposé via l'UI create-client)
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        role: "CLIENT",
        isSecretary: isSecretary ?? false,
        centreRole: centreRole ?? null,
        managerId: managerId ?? null,
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
        name: { in: ["LyraeExplain", ...NOMS_PRODUITS] },
      },
      select: { id: true, name: true },
    });
    const explainProduct = coreProducts.find(
      (p) => p.name.toLowerCase() === "lyraeexplain".toLowerCase()
    );
    const talkProduct = coreProducts.find(
      (p) => estProduit(p.name, "talk")
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

    auditLog("account", "create-client", {
      actor: {
        id: session.user.id,
        email: session.user.email ?? null,
        role: session.user.role,
        ip: extractIpFromRequest(request),
        userAgent: extractUserAgent(request),
      },
      target: { type: "user", id: newUser.id, label: newUser.email },
      metadata: { name: newUser.name, isSecretary: newUser.isSecretary, products: selectedProductIds },
    });

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

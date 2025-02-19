import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";

// Schéma de validation
const ModifyClientProductsSchema = z.object({
  clientId: z.number().int().positive("Client ID must be a positive number"),
  products: z.array(
    z.object({
      productId: z.number().int().positive("Product ID must be a positive number"),
      assignedAt: z.string().datetime(), // Validation de la date
    })
  ),
  action: z.enum(["add", "remove"]),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier la session de l'utilisateur
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can modify client products." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = ModifyClientProductsSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { clientId, products, action } = parseResult.data;

    // Vérifier si le client existe
    const client = await prisma.user.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    // Vérifier si les produits existent
    const productIds = products.map((p) => p.productId);
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (existingProducts.length !== productIds.length) {
      return NextResponse.json(
        { error: "Some products do not exist." },
        { status: 400 }
      );
    }

    if (action === "add") {
      // Récupérer les produits déjà associés
      const existingUserProducts = await prisma.userProduct.findMany({
        where: {
          userId: clientId,
          productId: { in: productIds },
        },
        select: { productId: true },
      });

      type ExistingUserProduct = { productId: number };

      const existingProductIds = new Set<number>(
        existingUserProducts.map((p: ExistingUserProduct) => p.productId)
      );

      // Filtrer les produits non déjà associés
      const newProductLinks = products.filter((p) => !existingProductIds.has(p.productId));

      // Pour chaque produit à ajouter, créer l'enregistrement et les détails associés si nécessaire
      for (const p of newProductLinks) {
        const createdUserProduct = await prisma.userProduct.create({
          data: {
            userId: clientId,
            productId: p.productId,
            assignedAt: new Date(p.assignedAt),
          },
        });
        // Si c'est le produit LyraeExplain (id = 1), créer les détails avec valeurs par défaut
        if (p.productId === 1) {
          await prisma.lyraeExplainDetails.create({
            data: {
              userProductId: createdUserProduct.id,
              rdv: null,
              borne: null,
              examen: null,
              secretaire: null,
              attente: null,
              metricsUpdatedAt: null,
            },
          });
        }
        // Si c'est le produit LyraeTalk (id = 2), créer les détails par défaut
        else if (p.productId === 2) {
          await prisma.lyraeTalkDetails.create({
            data: {
              userProductId: createdUserProduct.id,
              talkInfoValidated: false,
              talkLibelesValidated: false,
            },
          });
        }
      }

      return NextResponse.json(
        { message: "Products added successfully to the client." },
        { status: 200 }
      );
    } else if (action === "remove") {
      // Suppression des associations
      await prisma.userProduct.deleteMany({
        where: {
          userId: clientId,
          productId: { in: productIds },
        },
      });
      return NextResponse.json(
        { message: "Products removed successfully from the client." },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Error modifying client products:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

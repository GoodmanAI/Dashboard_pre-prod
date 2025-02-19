export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Définition de l'interface correspondant aux produits et leurs relations
interface ProductWithClients {
  id: number;
  name: string;
  description: string | null;
  userProducts: {
    assignedAt: Date;
    user: {
      id: number;
      name: string | null;
      email: string;
    };
  }[];
}

export async function GET(request: NextRequest) {
  try {
    // Vérifier la session utilisateur
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can view products." },
        { status: 403 }
      );
    }

    // Récupérer tous les produits avec leurs clients affiliés
    const products: ProductWithClients[] = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        userProducts: {
          select: {
            assignedAt: true,
            user: {
              select: {
                id: true,
                name: true, // Prisma peut retourner null ici
                email: true,
              },
            },
          },
        },
      },
    });

    // Transformer les données pour un format plus simple
    const formattedProducts = products.map((product: ProductWithClients) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      clients: product.userProducts.map((up) => ({
        id: up.user.id,
        name: up.user.name, // peut être string ou null
        email: up.user.email,
        assignedAt: up.assignedAt,
      })),
    }));

    return NextResponse.json(formattedProducts, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error(err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

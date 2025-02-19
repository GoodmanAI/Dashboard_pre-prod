export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

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
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        userProducts: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            assignedAt: true, // Date d'affiliation du produit au client
          },
        },
      },
    });

    // Transformer les données pour un format plus simple
    const formattedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      clients: product.userProducts.map(up => ({
        id: up.user.id,
        name: up.user.name,
        email: up.user.email,
        assignedAt: up.assignedAt, // Date d'affiliation du produit au client
      })),
    }));

    return NextResponse.json(formattedProducts, { status: 200 });
  } catch (error) {
    // Gérer les erreurs inconnues
    const err = error as Error;
    console.error(err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

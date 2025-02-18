import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request: NextRequest) {
  try {
    // Récupérer la session de l'utilisateur connecté
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can access this route." },
        { status: 403 }
      );
    }

    // Récupérer la liste des clients avec leurs produits associés
    const clients = await prisma.user.findMany({
      where: { role: "CLIENT" }, // Filtrer uniquement les clients
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        userProducts: {
          select: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
            assignedAt: true, // Récupérer la date d'affiliation du produit
          },
        },
      },
    });

    // Transformer les données pour un format plus lisible
    const formattedClients = clients.map(client => ({
      id: client.id,
      name: client.name,
      email: client.email,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      products: client.userProducts.map(up => ({
        id: up.product.id,
        name: up.product.name,
        assignedAt: up.assignedAt, // Date d'affiliation du produit
      })),
    }));

    return NextResponse.json(formattedClients, { status: 200 });
  } catch (error) {
    // Gérer les erreurs inattendues
    const err = error as Error;
    console.error(err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';


import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

interface RawClient {
  id: number;
  name: string | null;
  email: string;
  city: string | null;
  centreRole: "ADMIN_USER" | "USER" | null;
  createdAt: Date;
  updatedAt: Date;
  userProducts: {
    id: number;
    product: {
      id: number;
      name: string;
    };
    assignedAt: Date;
  }[];
}

export async function GET(request: NextRequest) {
  try {
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
        city: true,
        centreRole: true,
        createdAt: true,
        updatedAt: true,
        userProducts: {
          select: {
            id: true, // ID de la ligne UserProduct (= userProductId cross-app)
            product: {
              select: {
                id: true,
                name: true,
              },
            },
            assignedAt: true, // Date d'affiliation du produit
          },
        },
      },
    });

    // Transformer les données pour un format plus lisible
    const formattedClients = clients.map((client: RawClient) => ({
      id: client.id,
      name: client.name,
      email: client.email,
      city: client.city,
      centreRole: client.centreRole,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      products: client.userProducts.map(up => ({
        // ⚠️ "id" reste celui du Product (1, 2, …) pour conserver la compat front.
        // `userProductId` = ID de la ligne UserProduct (cohérent avec le reste du dashboard).
        id: up.product.id,
        userProductId: up.id,
        name: up.product.name,
        assignedAt: up.assignedAt,
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

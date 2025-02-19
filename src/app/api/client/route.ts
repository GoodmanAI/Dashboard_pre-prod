export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(request: NextRequest) {
  try {
    // Récupérer la session de l'utilisateur
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Récupérer les informations du client ainsi que ses produits affiliés avec les détails spécifiques
    const client = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        userProducts: {
          select: {
            assignedAt: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
            explainDetails: {
              select: {
                rdv: true,
                borne: true,
                examen: true,
                secretaire: true,
                attente: true,
                metricsUpdatedAt: true,
              },
            },
            talkDetails: {
              select: {
                talkInfoValidated: true,
                talkLibelesValidated: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client, { status: 200 });
  } catch (error) {
    console.error("Error fetching client data:", error);
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    );
  }
}

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

    // Récupérer les tickets créés par cet utilisateur
    const tickets = await prisma.ticket.findMany({
      where: { userId },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ tickets }, { status: 200 });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 });
  }
}

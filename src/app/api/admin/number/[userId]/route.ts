import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const userId = Number(params.userId);
  const { number } = await req.json();

  if (!number) {
    return NextResponse.json({ error: "Le numéro est obligatoire" }, { status: 400 });
  }

  // Vérifier que l'utilisateur existe
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  try {
    // Ajouter le numéro
    const newNumber = await prisma.userNumber.create({
      data: {
        userId,
        number
      }
    });

    return NextResponse.json(newNumber, { status: 201 });

  } catch (err: any) {
    // Prisma erreur unique constraint
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "Ce numéro est déjà attribué à un utilisateur" },
        { status: 409 }
      );
    }

    console.error(err);
    return NextResponse.json(
      { error: "Erreur serveur", details: err.message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const userId = Number(params.userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userNumbers: true }
  });

  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  return NextResponse.json(user.userNumbers);
}
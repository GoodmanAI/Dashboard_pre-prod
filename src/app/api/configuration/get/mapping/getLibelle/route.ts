import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { userProductId, codeExamenClient } = await req.json();

    if (!userProductId || !codeExamenClient) {
      return NextResponse.json(
        { error: "userProductId et codeExamenClient sont requis" },
        { status: 400 }
      );
    }

    const talkSettings = await prisma.talkSettings.findUnique({
      where: { userProductId },
      select: { exams: true },
    });

    if (!talkSettings || !talkSettings.exams) {
      return NextResponse.json(
        { error: "TalkSettings ou exams introuvable" },
        { status: 404 }
      );
    }

    const exams = talkSettings.exams as Record<string, any>;

    const exam = Object.values(exams).find(
      (e) => e.codeExamenClient === codeExamenClient
    );

    if (!exam) {
      return NextResponse.json(
        { error: "Examen non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      libelle: exam.libelle,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

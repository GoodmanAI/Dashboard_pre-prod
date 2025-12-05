import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

type ExamMap = Record<string, any>;

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  const { searchParams } = new URL(req.url);

  const userProductId = searchParams.get("userProductId");
  const codeExamen = searchParams.get("codeExamen");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId parameter" },
      { status: 400 }
    );
  }

  try {
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "No mapping found" },
        { status: 404 }
      );
    }

    // 🔥 Nouveau format : déjà un objet { codeExamen: examData }
    const exams = (settings.exams || {}) as ExamMap;

    console.log("exams", exams);

    // -------------------------------------------------------------------
    // 🔍 Si un codeExamen est demandé → renvoyer uniquement cet examen
    // -------------------------------------------------------------------
    if (codeExamen) {
      const exam = exams[codeExamen];

      if (!exam) {
        return NextResponse.json(
          { error: `No exam found for codeExamen "${codeExamen}"` },
          { status: 404 }
        );
      }

      return NextResponse.json({ [codeExamen]: exam });
    }

    // -------------------------------------------------------------------
    // 🔍 Sinon : renvoyer tout l'objet tel quel
    // -------------------------------------------------------------------
    return NextResponse.json(exams);

  } catch (error) {
    console.error("Failed to fetch mapping:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

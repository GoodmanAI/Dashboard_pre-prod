import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

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

    const exams: any = settings.exams || [];

    console.log("exams", exams);

    // Transform array → keyed object
    const keyed = Object.fromEntries(
      exams.map((exam: any) => [exam.codeExamen, exam])
    );

    // -------------------------------------
    // 🔍 Si un codeExamen est demandé
    // -------------------------------------
    if (codeExamen) {
      const exam = keyed[codeExamen];

      if (!exam) {
        return NextResponse.json(
          { error: `No exam found for codeExamen "${codeExamen}"` },
          { status: 404 }
        );
      }

      // Retourne un objet (PAS un tableau)
      return NextResponse.json({
        [codeExamen]: exam
      });
    }

    // -------------------------------------
    // 🔍 Sinon : retourner l'objet complet
    // -------------------------------------
    return NextResponse.json(keyed);

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

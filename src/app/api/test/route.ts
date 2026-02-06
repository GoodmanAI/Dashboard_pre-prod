import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const talkSettings = await prisma.talkSettings.findUnique({
      where: { id: 168 },
      select: { exams: true },
    });

    if (!talkSettings || !Array.isArray(talkSettings.exams)) {
      return NextResponse.json(
        { error: "TalkSettings ou exams introuvable" },
        { status: 404 }
      );
    }

    const updatedExams = talkSettings.exams.map((exam: any) => {
      if (exam.codeExamen === "N01RX007") {
        return {
          ...exam,
          typeExamen: "RX",
          typeExamenClient: "OS"
        };
      }
      return exam;
    });

    console.log(updatedExams);
    await prisma.talkSettings.update({
      where: { id: 168 },
      data: {
        exams: updatedExams,
      },
    });

    return NextResponse.json({
      success: true,
      message: "typeExamen mis à jour avec succès",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
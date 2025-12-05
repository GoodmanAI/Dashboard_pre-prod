import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type Speaker = "Lyrae" | "User";

interface Step {
  speaker: Speaker;
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const { userProductId, centerId, steps, stats } = data;

    if (!userProductId || !centerId || !steps || !Array.isArray(steps)) {
      return NextResponse.json(
        { error: "Missing or invalid parameters" },
        { status: 400 }
      );
    }

    // Transformation des steps
    const stepsTransformed: Step[] = steps.map((text: string, index: number) => ({
      speaker: index % 2 === 0 ? "Lyrae" : "User",
      text,
    }));

    await prisma.callConversation.create({
  data: {
    userProductId,
    centerId,
    steps: stepsTransformed as unknown as Prisma.InputJsonValue,
    stats: stats as unknown as Prisma.InputJsonValue,
  },
});

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("❌ Error saving call summary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

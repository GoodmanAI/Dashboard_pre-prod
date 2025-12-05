import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userProductId,
      centerId,
      steps,
      stats,
    } = body;

    // -------------------------
    // ✅ VALIDATION
    // -------------------------

    if (!userProductId || typeof userProductId !== "number") {
      return NextResponse.json(
        { error: "userProductId must be a number" },
        { status: 400 }
      );
    }

    if (!centerId || typeof centerId !== "number") {
      return NextResponse.json(
        { error: "centerId must be a number" },
        { status: 400 }
      );
    }

    if (!steps || typeof steps !== "object" || Array.isArray(steps)) {
      return NextResponse.json(
        { error: "steps must be a JSON object" },
        { status: 400 }
      );
    }

    if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
      return NextResponse.json(
        { error: "stats must be a JSON object" },
        { status: 400 }
      );
    }

    // Validate stats structure (optional but recommended)
    const {
      intents,
      rdv_status,
      patient_status,
      end_reason,
      questions_completed,
      exam_code,
    } = stats;

    if (intents && !Array.isArray(intents)) {
      return NextResponse.json(
        { error: "stats.intents must be an array" },
        { status: 400 }
      );
    }

    // -------------------------
    // ✅ SAVE IN DATABASE
    // -------------------------

    const saved = await prisma.callConversation.create({
      data: {
        userProductId,
        centerId,
        steps,
        stats: {
          intents: intents ?? [],
          rdv_status: rdv_status ?? null,
          patient_status: patient_status ?? null,
          end_reason: end_reason ?? null,
          questions_completed: questions_completed ?? false,
          exam_code: exam_code ?? null,
        },
      },
    });

    return NextResponse.json({ success: true, saved }, { status: 200 });

  } catch (error) {
    console.error("Error in call-conversation API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
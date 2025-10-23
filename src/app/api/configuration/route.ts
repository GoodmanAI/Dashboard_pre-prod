// src/app/api/configuration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, TalkSettings, User, Product } from '@prisma/client'

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId || isNaN(userProductId)) {
      return NextResponse.json(
        { error: "Missing or invalid userProductId" },
        { status: 400 }
      );
    }

    // ✅ Fetch settings for that userProductId
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "TalkSettings not found for this userProductId" },
        { status: 404 }
      );
    }

    // ✅ Map database object to your frontend type
    const response: {
      voice: string | null;
      botName: string | null;
      welcomeMsg: string | null;
      emergencyOutOfHours: string | null;
      callMode: "decroche" | "debordement" | null;
      fullPlanningNotes: string[];
      examsAccepted: Record<string, boolean>;
      examQuestions: Record<string, string[]>;
      specificNotes: string | null;
      reconnaissance: boolean;
    } = {
      voice: settings.voice,
      botName: settings.botName,
      welcomeMsg: settings.welcomeMsg,
      emergencyOutOfHours: settings.emergencyOutOfHours,
      callMode: settings.callMode as "decroche" | "debordement" | null,
      fullPlanningNotes: settings.fullPlanningNotes as string[],
      examsAccepted: settings.examsAccepted as Record<string, boolean>,
      examQuestions: settings.examQuestions as Record<string, string[]>,
      specificNotes: settings.specificNotes,
      reconnaissance: settings.reconnaissance,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Error fetching TalkSettings:", error);
    return NextResponse.json(
      { error: "Failed to fetch TalkSettings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const prisma = new PrismaClient();
  try {
    const body = await req.json();

    const {
      userProductId,
      voice,
      botName,
      welcomeMsg,
      emergencyOutOfHours,
      callMode,
      fullPlanningNotes,
      examsAccepted,
      examQuestions,
      specificNotes,
      reconnaissance,
    } = body;

    // ✅ Validate inputs
    if (typeof userProductId !== "number") {
      return NextResponse.json({ error: "userProductId must be a number" }, { status: 400 });
    }

    if (typeof reconnaissance !== "boolean") {
      return NextResponse.json({ error: "reconnaissance must be a boolean" }, { status: 400 });
    }

    // ✅ Save or update TalkSettings
    const settings = await prisma.talkSettings.upsert({
      where: { userProductId },
      update: {
        voice,
        botName,
        welcomeMsg,
        emergencyOutOfHours,
        callMode,
        fullPlanningNotes,
        examsAccepted,
        examQuestions,
        specificNotes,
        reconnaissance,
      },
      create: {
        userProductId,
        voice,
        botName,
        welcomeMsg,
        emergencyOutOfHours,
        callMode,
        fullPlanningNotes,
        examsAccepted,
        examQuestions,
        specificNotes,
        reconnaissance,
      },
    });

    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch (error) {
    console.error("Error saving TalkSettings:", error);
    return NextResponse.json({ error: "Failed to save TalkSettings" }, { status: 500 });
  }
}
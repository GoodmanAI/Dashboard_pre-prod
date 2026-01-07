import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/configuration?userProductId=XX
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId || isNaN(userProductId)) {
      return NextResponse.json(
        { error: "Missing or invalid userProductId" },
        { status: 400 }
      );
    }

    // 1️⃣ Récupérer les TalkSettings
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "TalkSettings not found for this userProductId" },
        { status: 404 }
      );
    }

    // 2️⃣ Récupérer les mappings d’examens
    const mappings = await prisma.examMapping.findMany({
      where: { userProductId },
    });

    // 3️⃣ Mapping FR -> Code
    const examCodeMap: Record<string, string> = {
      Echographie: "US",
      Mammographie: "MG",
      Radio: "RX",
      IRM: "MR",
      Scanner: "CT",
    };

    const mappedExamMappings = mappings.map((m: any) => ({
      ...m,
      labelFr: examCodeMap[m.fr] ?? m.fr,
    }));

    const defaultTypes = {
      types: [],
      accepted: {},
      questions: {},
    };

    // 4️⃣ Réponse finale
    return NextResponse.json(
      {
        voice: settings.voice,
        botName: settings.botName,
        welcomeMsg: settings.welcomeMsg,
        emergencyOutOfHours: settings.emergencyOutOfHours,
        callMode: settings.callMode,
        fullPlanningNotes: settings.fullPlanningNotes,
        examsAccepted: settings.examsAccepted,
        examQuestions: settings.examQuestions,
        specificNotes: settings.specificNotes,
        reconnaissance: settings.reconnaissance,

        centerName: settings.centerName,
        address: settings.address,
        address2: settings.address2,

        // 🆕 NOUVEAUX CHAMPS
        centerPhone: settings.centerPhone,
        centerWebsite: settings.centerWebsite,
        centerMail: settings.centerMail,

        examMappings:
          mappedExamMappings.length > 0
            ? mappedExamMappings
            : defaultTypes,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in GET /configuration:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/configuration
 */
export async function POST(req: NextRequest) {
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

      centerName,
      address,
      address2,

      // 🆕 NOUVEAUX CHAMPS
      centerPhone,
      centerWebsite,
      centerMail,
    } = body;

    // ✅ Validations minimales
    if (typeof userProductId !== "number") {
      return NextResponse.json(
        { error: "userProductId must be a number" },
        { status: 400 }
      );
    }

    if (typeof reconnaissance !== "boolean") {
      return NextResponse.json(
        { error: "reconnaissance must be a boolean" },
        { status: 400 }
      );
    }

    // ✅ Upsert TalkSettings
    const settings = await prisma.talkSettings.upsert({
      where: { userProductId: userProductId },
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

        centerName,
        address,
        address2,

        // 🆕 NOUVEAUX CHAMPS
        centerPhone,
        centerWebsite,
        centerMail,
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

        centerName,
        address,
        address2,

        // 🆕 NOUVEAUX CHAMPS
        centerPhone,
        centerWebsite,
        centerMail,
      },
    });

    return NextResponse.json(
      { success: true, settings },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error saving TalkSettings:", error);
    return NextResponse.json(
      { error: "Failed to save TalkSettings" },
      { status: 500 }
    );
  }
}

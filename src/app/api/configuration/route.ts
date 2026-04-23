import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";

/**
 * GET /api/configuration?userProductId=XX
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthOrApiKey(req, "BOT_API_KEY");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId || isNaN(userProductId)) {
      return NextResponse.json(
        { error: "Missing or invalid userProductId" },
        { status: 400 }
      );
    }

    if (!auth.bot) {
      const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
      if (ownershipErr) return ownershipErr;
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

    console.log(settings);

    const doubleExamCodeMap: Record<string, string> = {
      radio: "RX",
      echographie: "US",
      mammographie: "MG",
      scanner: "CT",
      irm: "MR",
      echomammaire: "USMAM",
    };

    const allDoubleCombos: string[] = [
      "RX+RX",
      "US+US",
      "RX+US",
      "US+MG",
      "RX+MG",
      "MG+USMAM",
      "US+CT",
      "RX+CT",
      "MG+CT",
      "US+MR",
      "RX+MR",
      "MG+MR",
      "CT+MR",
    ];

    const rawMultiExam = (settings.multiExamMapping ?? {}) as Record<
      string,
      { enabled?: boolean; mode?: string }
    >;

    /**
     * 🔹 Création d'une map de référence
     * clé = version triée alphabétiquement
     * valeur = format officiel défini dans allDoubleCombos
     */
    const comboReference = new Map<string, string>();

    allDoubleCombos.forEach((combo) => {
      const [a, b] = combo.split("+");
      const normalized = [a, b].sort().join("+");
      comboReference.set(normalized, combo);
    });

    const convertedFromDb: Record<
      string,
      { enabled: boolean; mode: string }
    > = {};

    Object.entries(rawMultiExam).forEach(([key, value]) => {
      const [examA, examB] = key.split("_");

      const codeA = doubleExamCodeMap[examA];
      const codeB = doubleExamCodeMap[examB];

      if (!codeA || !codeB) return;

      // 🔹 Normalisation dans les deux sens
      const normalized = [codeA, codeB].sort().join("+");

      const finalKey = comboReference.get(normalized);

      if (!finalKey) return; // combo non autorisé

      convertedFromDb[finalKey] = {
        enabled: value.enabled ?? false,
        mode: value.mode ?? "single",
      };
    });

    console.log("convertedFromDb", convertedFromDb);

    const formattedMultiExam: Record<
      string,
      { enabled: boolean; mode: string }
    > = {};

    allDoubleCombos.forEach((combo) => {
      formattedMultiExam[combo] = {
        enabled: convertedFromDb[combo]?.enabled ?? false,
        mode: convertedFromDb[combo]?.mode ?? "single",
      };
    });

    console.log(formattedMultiExam);

    // 4️⃣ Réponse finale
    return NextResponse.json(
      {
        voice: settings.voice,
        // botName: settings.botName,
        welcomeMsg: settings.welcomeMsg,
        // emergencyOutOfHours: settings.emergencyOutOfHours,
        // callMode: settings.callMode,
        fullPlanningNotes: settings.fullPlanningNotes,
        examsAccepted: settings.examsAccepted,
        examQuestions: settings.examQuestions,
        // specificNotes: settings.specificNotes,
        // reconnaissance: settings.reconnaissance,

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
        
        doubleBookingConfig: formattedMultiExam,
        options: settings.options,
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
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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

      centerPhone,
      centerWebsite,
      centerMail,
      options,
    } = body;

    // ✅ Validations minimales
    if (typeof userProductId !== "number") {
      return NextResponse.json(
        { error: "userProductId must be a number" },
        { status: 400 }
      );
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

    if (typeof reconnaissance !== "boolean") {
      return NextResponse.json(
        { error: "reconnaissance must be a boolean" },
        { status: 400 }
      );
    }

    if (options && typeof options !== "object") {
      return NextResponse.json(
        { error: "options must be an object" },
        { status: 400 }
      );
    }

    // ✅ Upsert TalkSettings
    console.log(`where: { userProductId: ${userProductId} },`);
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

        centerPhone,
        centerWebsite,
        centerMail,
        options
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

        centerPhone,
        centerWebsite,
        centerMail,
        options
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

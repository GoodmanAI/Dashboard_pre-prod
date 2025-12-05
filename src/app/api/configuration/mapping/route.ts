import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userProductId, data } = body;

    if (!userProductId || !Array.isArray(data)) {
      return NextResponse.json({ error: "userProductId and data are required" }, { status: 400 });
    }

    // 🔹 Transform data if needed (ex: remove temporary fields)
    const exams = data.map((row: any) => ({
      typeExamen: row.typeExamen,
      codeExamen: row.codeExamen,
      libelle: row.libelle,
      typeExamenClient: row.typeExamenClient || "",
      codeExamenClient: row.codeExamenClient || "",
      libelleClient: row.libelleClient || ""
    }));

    // 🔹 Upsert TalkSettings
    const settings = await prisma.talkSettings.upsert({
      where: { userProductId: Number(userProductId) },
      update: { exams },
      create: { userProductId: Number(userProductId), exams },
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Failed to save mapping:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = searchParams.get("userProductId");

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId parameter." },
        { status: 400 }
      );
    }

    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "No data found for this userProductId." },
        { status: 404 }
      );
    }

    return NextResponse.json(settings.exams, { status: 200 });
  } catch (error: any) {
    console.error("❌ Error retrieving TalkSettings:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
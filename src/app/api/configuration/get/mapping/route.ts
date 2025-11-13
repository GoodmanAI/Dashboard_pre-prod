// src/app/api/configuration/get/mapping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  const { searchParams } = new URL(req.url);
  const userProductId = searchParams.get("userProductId");

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
        { status: 400 } // <-- your preference
      );
    }

    return NextResponse.json(settings.exams || []);
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

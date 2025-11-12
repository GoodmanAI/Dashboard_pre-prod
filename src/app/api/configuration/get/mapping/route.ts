// src/app/api/configuration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, TalkSettings, User, Product } from '@prisma/client'

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  const { searchParams } = new URL(req.url);
  const talkSettingsId = searchParams.get("talkSettingsId");

  if (!talkSettingsId) {
    return NextResponse.json(
      { error: "Missing talkSettingsId parameter" },
      { status: 400 }
    );
  }

  try {
    const exams = await prisma.talkExam.findMany({
      where: { talkSettingsId: Number(talkSettingsId) },
    });

    return NextResponse.json(exams);
  } catch (error) {
    console.error("Failed to fetch exams:", error);
    return NextResponse.json(
      { error: "Failed to fetch exams" },
      { status: 500 }
    );
  }

}
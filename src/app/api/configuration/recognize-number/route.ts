// src/app/api/configuration/recognize-number/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userProductId, reconnaissance } = body;

    // Validate input
    if (typeof userProductId !== "number") {
      return NextResponse.json(
        { error: "Invalid or missing userProductId" },
        { status: 400 }
      );
    }

    if (typeof reconnaissance !== "boolean") {
      return NextResponse.json(
        { error: "Invalid or missing reconnaissance value" },
        { status: 400 }
      );
    }

    // Save (or update if already exists)
    const settings = await prisma.talkSettings.upsert({
      where: { userProductId },
      update: { reconnaissance },
      create: { userProductId, reconnaissance },
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
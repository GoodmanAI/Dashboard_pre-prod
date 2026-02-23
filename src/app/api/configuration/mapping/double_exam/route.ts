import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adapte le chemin si besoin

// =========================
// GET
// =========================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId" },
        { status: 400 }
      );
    }

    const talkSettings = await prisma.talkSettings.findUnique({
      where: { userProductId },
      select: { multiExamMapping: true },
    });

    return NextResponse.json(
      talkSettings?.multiExamMapping ?? {}
    );
  } catch (error) {
    console.error("GET double_exam error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// =========================
// POST
// =========================
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId" },
        { status: 400 }
      );
    }

    const body = await req.json();

    // Upsert : crée si n'existe pas
    const updated = await prisma.talkSettings.upsert({
      where: { userProductId },
      update: {
        multiExamMapping: body,
      },
      create: {
        userProductId,
        multiExamMapping: body,
      },
    });

    return NextResponse.json(updated.multiExamMapping);
  } catch (error) {
    console.error("POST double_exam error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

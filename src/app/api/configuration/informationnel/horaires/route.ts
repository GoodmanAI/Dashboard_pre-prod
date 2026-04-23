// app/api/configuration/informationnel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userProductId = Number(url.searchParams.get("userProductId"));
    if (!userProductId) {
      return NextResponse.json({ success: false, error: "userProductId missing" }, { status: 400 });
    }

    const userProduct = await prisma.userProduct.findUnique({
      where: { id: userProductId },
      include: { informationSettings: true },
    });

    if (!userProduct) {
      return NextResponse.json({ success: false, error: "userProduct not found" }, { status: 404 });
    }

    // If you want to return the rest of the previously-saved form, put it here.
    return NextResponse.json({
      success: true,
      data: {
        weeklyHours: userProduct.informationSettings?.weeklyHours ?? {},
      },
    });
  } catch (err) {
    console.error("GET /api/configuration/informationnel error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userProductId = Number(body.userProductId);
    if (!userProductId) {
      return NextResponse.json({ success: false, error: "userProductId missing" }, { status: 400 });
    }

    // Expect the frontend to send the whole form. We'll extract `weeklyHours`
    // and `data` (other form fields). Adjust as needed.
    const weeklyHours = body.weeklyHours ?? {};

    // Find or create TalkInformationSettings row for this userProduct
    const upserted = await prisma.talkInformationSettings.upsert({
      where: { userProductId },
      create: {
        userProductId,
        weeklyHours: weeklyHours,
      },
      update: {
        weeklyHours: weeklyHours,
      },
    });

    return NextResponse.json({ success: true, data: upserted });
  } catch (err) {
    console.error("POST /api/configuration/informationnel error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

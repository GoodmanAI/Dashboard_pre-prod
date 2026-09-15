// app/api/configuration/informationnel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma'
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { journaliserEcritureConfig } from "@/lib/auditConfig";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const url = new URL(req.url);
    const userProductId = Number(url.searchParams.get("userProductId"));
    if (!userProductId) {
      return NextResponse.json({ success: false, error: "userProductId missing" }, { status: 400 });
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

    const droitErr = await requirePagePermission(PAGES.PARAMETRAGE, "read");
    if (droitErr) return droitErr;

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
    const droitEcritureErr = await requirePagePermission(PAGES.PARAMETRAGE, "write");
    if (droitEcritureErr) return droitEcritureErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const userProductId = Number(body.userProductId);
    if (!userProductId) {
      return NextResponse.json({ success: false, error: "userProductId missing" }, { status: 400 });
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

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

    // Qui a change quoi. Sans cette ligne, une modification de configuration
    // faite par un sous-compte ne laissait aucune trace. Voir auditConfig.ts.
    journaliserEcritureConfig(req, session, "talk-horaires-update", userProductId);

    return NextResponse.json({ success: true, data: upserted });
  } catch (err) {
    console.error("POST /api/configuration/informationnel error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

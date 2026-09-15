import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adapte le chemin si besoin
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { journaliserEcritureConfig } from "@/lib/auditConfig";

// =========================
// GET
// =========================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId" },
        { status: 400 }
      );
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

    const droitErr = await requirePagePermission(PAGES.MAPPING_EXAM, "read");
    if (droitErr) return droitErr;

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
    const droitEcritureErr = await requirePagePermission(PAGES.MAPPING_EXAM, "write");
    if (droitEcritureErr) return droitEcritureErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const userProductId = Number(searchParams.get("userProductId"));

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId" },
        { status: 400 }
      );
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

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

    // Qui a change quoi. Sans cette ligne, une modification de configuration
    // faite par un sous-compte ne laissait aucune trace. Voir auditConfig.ts.
    journaliserEcritureConfig(req, session, "talk-double-examen-update", userProductId);

    return NextResponse.json(updated.multiExamMapping);
  } catch (error) {
    console.error("POST double_exam error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

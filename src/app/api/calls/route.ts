// app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const userProductIdParam = searchParams.get("userProductId");
    const callIdParam = searchParams.get("call");

    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const statusParam = searchParams.get("status");

    if (!userProductIdParam) {
      return NextResponse.json(
        { error: "Paramètre userProductId manquant." },
        { status: 400 }
      );
    }

    const userProductId = Number(userProductIdParam);
    if (!Number.isFinite(userProductId)) {
      return NextResponse.json(
        { error: "Paramètre userProductId invalide." },
        { status: 400 }
      );
    }

    // ==========================
    // CAS 1 : récupération d’un seul call (inchangé)
    // ==========================
    if (callIdParam) {
      const callId = Number(callIdParam);
      if (!Number.isFinite(callId)) {
        return NextResponse.json(
          { error: "Paramètre call invalide." },
          { status: 400 }
        );
      }

      const call = await prisma.callConversation.findFirst({
        where: { id: callId, userProductId },
      });

      if (!call) {
        return NextResponse.json(
          { error: "Aucun appel trouvé." },
          { status: 404 }
        );
      }

      return NextResponse.json([call], { status: 200 });
    }

    // ==========================
    // CAS 2 : liste des calls
    // ==========================

    const isPaginated = pageParam !== null || limitParam !== null;

    const page = Number(pageParam) || 1;
    const limit = Number(limitParam) || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      userProductId,
      stats: {
        path: ["duration"],
        gt: 15,
      },
    };

    if (statusParam && statusParam !== "all") {
      whereClause.stats = {
        ...(statusParam === "canceled"
          ? { rdv_canceled: { gt: 0 } }
          : { rdv_status: statusParam }),
      };
    }

    // --------------------------
    // PAGINÉ
    // --------------------------
    if (isPaginated) {
      const [calls, total] = await Promise.all([
        prisma.callConversation.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.callConversation.count({
          where: whereClause,
        }),
      ]);

      const filteredCalls = calls.filter((c: any) => {
        return (
          (c.stats?.duration ? Number(c.stats.duration) > 15 : false) &&
          c.steps &&
          c.steps.length > 1
        );
      });

      return NextResponse.json(
        {
          data: filteredCalls,
          total,
          page,
          limit,
        },
        { status: 200 }
      );
    }

    // --------------------------
    // NON PAGINÉ (legacy)
    // --------------------------
    let calls = await prisma.callConversation.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    calls = calls.filter((c: any) => {
      return (
        (c.stats?.duration ? Number(c.stats.duration) > 15 : false) &&
        c.steps &&
        c.steps.length > 1
      );
    });

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    console.error("Erreur fetching calls:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue." },
      { status: 500 }
    );
  }
}

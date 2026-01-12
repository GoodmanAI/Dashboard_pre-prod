// app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

interface CallListPageProps {
  params: { id: string }; // récupéré depuis la route Next.js
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userProductIdParam = searchParams.get("userProductId");
    const callIdParam = searchParams.get("call");

    if (!userProductIdParam) {
      return NextResponse.json({ error: "Paramètre userProductId manquant." }, { status: 400 });
    }

    const userProductId = Number(userProductIdParam);
    if (!Number.isFinite(userProductId)) {
      return NextResponse.json({ error: "Paramètre userProductId invalide." }, { status: 400 });
    }

    let calls;

    if (callIdParam) {
      // Si un callId est fourni, on ne récupère que ce call
      const callId = Number(callIdParam);
      if (!Number.isFinite(callId)) {
        return NextResponse.json({ error: "Paramètre call invalide." }, { status: 400 });
      }

      const call = await prisma.callConversation.findFirst({
        where: { id: callId, userProductId },
      });

      if (!call) {
        return NextResponse.json(
          { error: "Aucun appel trouvé pour ce userProductId avec cet id." },
          { status: 404 }
        );
      }

      calls = [call]; // Retourne sous forme de tableau pour cohérence
    } else {
      // Sinon, récupère tous les appels pour ce userProductId
      calls = await prisma.callConversation.findMany({
        where: { userProductId },
        orderBy: { createdAt: "desc" },
      });
    }

    calls = calls.filter((c: any) => {
      return (c.stats.duration ? (Number(c.stats.duration) > 15 ? true : false) : false);
    });

    calls = calls.filter((c: any) => {
      return c.steps && c.steps.length > 1;
    });

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    console.error("Erreur fetching calls:", error);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

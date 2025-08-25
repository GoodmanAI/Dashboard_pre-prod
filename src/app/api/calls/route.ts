export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Access denied. Seuls les utilisateurs connectés peuvent accéder à leurs appels" },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const intent = searchParams.get("intent") ?? undefined;

    // --- Date filter: "all" => pas de filtre
    const daysAgoParam = searchParams.get("daysAgo");
    const parsed = daysAgoParam && daysAgoParam !== "all" ? Number(daysAgoParam) : undefined;
    const daysAgo = Number.isFinite(parsed as number) ? (parsed as number) : undefined;

    // --- Acting as (admin_user -> managed user)
    const asUserIdParam = searchParams.get("asUserId");
    let effectiveUserId = session.user.id;

    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam);
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: "Paramètre asUserId invalide." }, { status: 400 });
      }

      // Si on agit pour un autre user que soi-même, il faut être ADMIN_USER et manager du compte ciblé.
      if (asUserId !== session.user.id) {
        const current = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { centreRole: true },
        });

        if (current?.centreRole !== "ADMIN_USER") {
          return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
        }

        const managed = await prisma.user.findFirst({
          where: { id: asUserId, managerId: session.user.id },
          select: { id: true },
        });

        if (!managed) {
          return NextResponse.json({ error: "Centre non géré par cet administrateur." }, { status: 403 });
        }

        effectiveUserId = asUserId;
      }
    }

    // --- Construction du filtre
    const where: any = {
      userId: effectiveUserId,
      ...(intent && { intent: { equals: intent, mode: "insensitive" } }), // insensible à la casse
    };

    if (daysAgo !== undefined) {
      where.createdAt = { gte: subDays(new Date(), daysAgo) };
    }

    const calls = await prisma.call.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    console.error("Error fetching calls:", error);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

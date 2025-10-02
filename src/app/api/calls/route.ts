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

    const daysAgoParam = searchParams.get("daysAgo");
    const parsed = daysAgoParam && daysAgoParam !== "all" ? Number(daysAgoParam) : undefined;
    const daysAgo = Number.isFinite(parsed as number) ? (parsed as number) : undefined;

    const asUserIdParam = searchParams.get("asUserId");
    let effectiveUserId = session.user.id as number;

    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam);
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: "Paramètre asUserId invalide." }, { status: 400 });
      }

      if (asUserId !== session.user.id) {
        const current = await prisma.user.findUnique({
          where: { id: session.user.id as number },
          select: { centreRole: true },
        });

        if (current?.centreRole !== "ADMIN_USER") {
          return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
        }

        const managed = await prisma.user.findFirst({
          where: { id: asUserId, managerId: session.user.id as number },
          select: { id: true },
        });

        if (!managed) {
          return NextResponse.json({ error: "Centre non géré par cet administrateur." }, { status: 403 });
        }

        effectiveUserId = asUserId;
      }
    }

    // ===== DEMO MODE PARAMETERS =====
    const demo = ["1", "true", "yes"].includes((searchParams.get("demo") || "").toLowerCase());
    const demoDaysRaw = Number(searchParams.get("demoDays") || "30");
    const demoDays = Number.isFinite(demoDaysRaw) && demoDaysRaw > 0 ? demoDaysRaw : 30;
    const anchorParam = searchParams.get("anchor"); // ISO venant du front
    const anchorNow = anchorParam ? new Date(anchorParam) : new Date(); // fallback = now
    const demoPreserveDow = ["1", "true", "yes"].includes(
      (searchParams.get("demoPreserveDow") || "").toLowerCase()
    );
    // =================================

    const where: any = {
      userId: effectiveUserId,
      ...(intent && { intent: { equals: intent, mode: "insensitive" } }),
    };

    if (!demo && daysAgo !== undefined) {
      where.createdAt = { gte: subDays(new Date(), daysAgo) };
    }

    const calls = await prisma.call.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (demo) {
      // Remap temporel stable basé sur 'anchorNow', avec option de préservation du jour de semaine
      const mapped = calls.map((c) => {
        const original = new Date(c.createdAt as unknown as string);
        const h = original.getHours();
        const m = original.getMinutes();
        const s = original.getSeconds();
        const origDow = original.getDay();  // 0=dim ... 6=sam
        const anchorDow = anchorNow.getDay();

        // base pseudo-aléatoire stable dans [0, demoDays)
        const base = Math.abs((c.id * 9301 + (effectiveUserId as number) * 49297)) % demoDays;

        let bucket = base;

        // On veut (anchorNow - bucket).getDay() === origDow
        // => bucket ≡ (anchorDow - origDow) (mod 7)
        if (demoPreserveDow && demoDays >= 7) {
          const needMod = (anchorDow - origDow + 7) % 7;
          const mod = ((base - needMod) % 7 + 7) % 7; // vrai modulo positif
          bucket = base - mod;
          while (bucket >= demoDays) bucket -= 7;
          while (bucket < 0) bucket += 7;
        }

        const synthetic = new Date(anchorNow);
        synthetic.setHours(h, m, s, 0);
        synthetic.setDate(anchorNow.getDate() - bucket);

        return {
          ...c,
          createdAt: synthetic, // renvoyé en ISO par Next
        };
      });

      // Applique daysAgo APRÈS remap si demandé
      let filtered = mapped;
      if (daysAgo !== undefined) {
        const threshold = subDays(anchorNow, daysAgo).getTime();
        filtered = mapped.filter(
          (c) => new Date(c.createdAt as unknown as string).getTime() >= threshold
        );
      }

      return NextResponse.json(filtered, { status: 200 });
    }

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    console.error("Error fetching calls:", error);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

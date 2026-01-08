import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ------------------ UTILITAIRES ------------------
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// ------------------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = parseInt(searchParams.get("userProductId") || "", 10);

    if (isNaN(userProductId)) {
      return NextResponse.json(
        { error: "userProductId manquant" },
        { status: 400 }
      );
    }

    const settings = await prisma.talkInformationSettings.findUnique({
      where: { userProductId },
    });

    const weeklyHours: any = settings?.weeklyHours;
    if (!weeklyHours) {
      return NextResponse.json({
        openNow: false,
        message: "Aucun horaire défini",
      });
    }

    // Jours JS : 0 = dimanche
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    // ------------------ DATE / HEURE (PARIS) ------------------
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
    );

    const currentDay = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const today = weeklyHours[currentDay];

    // ------------------ 1. OUVERT MAINTENANT ------------------
    if (today?.enabled && today.ranges?.length > 0) {
      const activeRange = today.ranges.find((range: any) => {
        const start = toMinutes(range.start);
        const end = toMinutes(range.end);
        return currentMinutes >= start && currentMinutes < end;
      });

      if (activeRange) {
        return NextResponse.json({
          openNow: true,
          currentRange: activeRange,
          message: "Centre actuellement ouvert",
        });
      }
    }

    // ------------------ 2. PROCHAINE OUVERTURE AUJOURD’HUI ------------------
    if (today?.enabled && today.ranges?.length > 0) {
      const nextTodayRange = today.ranges.find(
        (range: any) => currentMinutes < toMinutes(range.start)
      );

      if (nextTodayRange) {
        return NextResponse.json({
          openNow: false,
          nextOpening: {
            day: currentDay,
            start: nextTodayRange.start,
          },
        });
      }
    }

    // ------------------ 3. PROCHAINS JOURS ------------------
    const nextDays = [
      ...days.slice(days.indexOf(currentDay) + 1),
      ...days.slice(0, days.indexOf(currentDay)),
    ];

    for (const day of nextDays) {
      const d = weeklyHours[day];
      if (d?.enabled && d.ranges?.length > 0) {
        return NextResponse.json({
          openNow: false,
          nextOpening: {
            day,
            start: d.ranges[0].start,
          },
        });
      }
    }

    // ------------------ 4. AUCUNE OUVERTURE ------------------
    return NextResponse.json({
      openNow: false,
      message: "Centre fermé toute la semaine",
    });
  } catch (e) {
    console.error("Erreur route opening:", e);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

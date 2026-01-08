import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductId = parseInt(searchParams.get("userProductId") || "", 10);

    if (isNaN(userProductId)) {
      return NextResponse.json({ error: "userProductId manquant" }, { status: 400 });
    }

    const settings = await prisma.talkInformationSettings.findUnique({
      where: { userProductId },
    });

    const weeklyHours: any = settings?.weeklyHours;
    if (!weeklyHours) {
      return NextResponse.json({
        openNow: false,
        message: "Aucun horaire défini"
      });
    }

    // Liste des jours dans le bon ordre
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
    );
    const currentTime = now.toTimeString().slice(0, 5);
    const currentDay: any = days[now.getDay()];

    const today = weeklyHours[currentDay];

    // ---------- FONCTION D'AIDE -----------
    const isBetween = (time: string, start: string, end: string) =>
      time >= start && time <= end;

    // ---------- 1. Vérifier si ouvert maintenant ----------
    if (today?.enabled && today.ranges?.length > 0) {
      const activeRange = today.ranges.find((range: any) =>
        isBetween(currentTime, range.start, range.end)
      );

      if (activeRange) {
        return NextResponse.json({
          openNow: true,
          currentRange: activeRange,
          message: "Centre actuellement ouvert"
        });
      }
    }

    // ---------- 2. Sinon : chercher la prochaine plage ----------
    const searchOrder = [
      ...days.slice(days.indexOf(currentDay) + 1),
      ...days.slice(0, days.indexOf(currentDay) + 1)
    ];

    for (const day of searchOrder) {
      const d = weeklyHours[day];
      if (d?.enabled && d.ranges?.length > 0) {
        // si c’est aujourd’hui, chercher une plage après l’heure actuelle
        if (day === currentDay) {
          const nextTodayRange = d.ranges.find((r: any) => r.start > currentTime);
          if (nextTodayRange) {
            return NextResponse.json({
              openNow: false,
              nextOpening: { day, start: nextTodayRange.start },
            });
          }
        }

        // sinon retour première plage du jour suivant
        return NextResponse.json({
          openNow: false,
          nextOpening: {
            day,
            start: d.ranges[0].start,
          },
        });
      }
    }

    // ---------- 3. Aucun horaire trouvé ----------
    return NextResponse.json({
      openNow: false,
      message: "Centre fermé toute la semaine"
    });

  } catch (e) {
    console.error("Erreur route opening:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

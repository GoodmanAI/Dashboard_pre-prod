import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";

export async function GET(request: NextRequest) {
  try {
    // Récupérer la liste des produits et leurs clients affiliés
    const productStats = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        userProducts: {
          select: {
            assignedAt: true, // Date d'affiliation
          },
        },
      },
    });

    // Fonction pour extraire la semaine ISO (YYYY-WW)
    const getWeekNumber = (date: Date) => {
      const year = date.getFullYear();
      const start = new Date(year, 0, 1);
      const diff = date.getTime() - start.getTime();
      const oneWeek = 1000 * 60 * 60 * 24 * 7;
      const weekNumber = Math.ceil(diff / oneWeek);
      return `${year}-W${weekNumber}`;
    };

    // Stocker les données par semaine
    const weeklyData: Record<string, Record<string, number>> = {};

    productStats.forEach((product) => {
      product.userProducts.forEach(({ assignedAt }) => {
        const week = getWeekNumber(new Date(assignedAt));

        if (!weeklyData[week]) weeklyData[week] = {};
        if (!weeklyData[week][product.name]) weeklyData[week][product.name] = 0;

        weeklyData[week][product.name] += 1;
      });
    });

    // Convertir les données en tableau trié par date
    const chartData = Object.keys(weeklyData)
      .sort()
      .map((week) => ({
        date: week, // Changer "week" en "date" pour correspondre aux attentes du composant
        products: weeklyData[week],
      }));

    return NextResponse.json({ chartData }, { status: 200 });
  } catch (error) {
    console.error("Error fetching sales overview data:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching sales overview data." },
      { status: 500 }
    );
  }
}

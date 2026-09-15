import { NextRequest, NextResponse } from "next/server";
// Migré de `@/utils/prisma` (client legacy) vers le client canonique le
// 14/09/2026, comme le demande le CLAUDE.md du dépôt quand on passe sur un
// fichier. `@/lib/prisma` n'a pas d'export par défaut, d'où l'import nommé.
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

interface ProductStat {
  id: number;
  name: string;
  userProducts: { assignedAt: Date }[];
}

export async function GET(request: NextRequest) {
  // ⚠️ Cette route n'avait AUCUNE garde de rôle jusqu'au 14/09/2026 : ni session
  // vérifiée dans le handler, ni contrôle d'appartenance. Seul le middleware
  // exigeait une session, donc tout compte client authentifié lisait la
  // répartition hebdomadaire des affiliations de tous les produits, c'est-à-dire
  // le rythme commercial de Lyrae. Elle est sous `/api/admin/`, elle n'alimente
  // que la page `/admin/overview` : `requireAdmin` est le bon niveau.
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  try {
    // Récupérer la liste des produits et leurs clients affiliés
    const productStats: ProductStat[] = await prisma.product.findMany({
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

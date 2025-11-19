import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userProductId, data } = body;

    if (!userProductId || !Array.isArray(data)) {
      return NextResponse.json(
        { error: "Missing or invalid parameters." },
        { status: 400 }
      );
    }

    // Fonction pour parser les chaînes qui ressemblent à des tableaux
    const parseArrayString = (val: any) => {
      if (!val || typeof val !== "string") return val;
      const trimmed = val.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        const content = trimmed.slice(1, -1).trim();
        if (!content) return [];
        return content
          .split(/,(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
      }
      return val;
    };

    // Nettoyage des données
    const cleanedData = data.map((row: any) => ({
      ...row,
      Interrogatoire: parseArrayString(row.Interrogatoire),
      Synonymes: parseArrayString(row.Synonymes),
    }));

    // Transformation tableau → objet clé → valeur (codeExamen comme clé)
    const keyedData = Object.fromEntries(
      cleanedData.map((row: any) => [row.codeExamen, row])
    );

    // Sauvegarde dans la BDD
    await prisma.talkSettings.upsert({
      where: { userProductId: Number(userProductId) },
      update: { exams: keyedData },
      create: { userProductId: Number(userProductId), exams: keyedData },
    });

    return NextResponse.json({ success: true, count: cleanedData.length });
  } catch (error: any) {
    console.error("❌ Error saving TalkSettings:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

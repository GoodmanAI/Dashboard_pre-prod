import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import Papa from "papaparse"; // npm install papaparse

type ExamMap = Record<string, any>;

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  const { searchParams } = new URL(req.url);

  const userProductId = searchParams.get("userProductId");
  const codeExamen = searchParams.get("codeExamen");

  if (!userProductId) {
    return NextResponse.json({ error: "Missing userProductId parameter" }, { status: 400 });
  }

  try {
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    let exams: ExamMap = {};

    if (settings && Array.isArray(settings.exams)) {
      // ✅ Transforme le tableau en objet { codeExamen: examData }
      settings.exams.forEach((exam: any) => {
        if (exam.codeExamen) exams[exam.codeExamen] = exam;
      });
    } else {
      console.log("there");
      // 🔹 Fallback CSV
      const csvFilePath = path.join(process.cwd(), "public", "mock-datas.csv");
      const csvContent = fs.readFileSync(csvFilePath, "utf-8");
      const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
      
      parsed.data.forEach((row: any) => {
        // Nettoyage des clés : trim() pour enlever les espaces
        const cleanedRow: any = {};
        Object.entries(row).forEach(([k, v]: any) => {
          cleanedRow[k.trim()] = v.trim();
        });

        if (cleanedRow['codeExamen NEURACORP']) {
          exams[cleanedRow['codeExamen NEURACORP']] = {
            typeExamen: cleanedRow['typeExamen NEURACORP'] || "",
            codeExamen: cleanedRow['codeExamen NEURACORP'] || "",
            libelle: cleanedRow['libelle NEURACORP'] || "",
            typeExamenClient: cleanedRow['typeExamen Client'] || "",
            codeExamenClient: cleanedRow['codeExamen Client'] || "",
            libelleClient: cleanedRow['libelle Client'] || "",
          };
        }
      });

    }

    // 🔍 Retourne un codeExamen spécifique si demandé
    if (codeExamen) {
      const exam = exams[codeExamen];
      if (!exam) {
        return NextResponse.json(
          { error: `No exam found for codeExamen "${codeExamen}"` },
          { status: 404 }
        );
      }
      return NextResponse.json({ [codeExamen]: exam });
    }

    console.log(exams)
    return NextResponse.json(exams);
  } catch (error: any) {
    console.error("Failed to fetch mapping:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

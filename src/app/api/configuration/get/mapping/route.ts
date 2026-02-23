import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { BlobServiceClient } from "@azure/storage-blob";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Exam = Record<string, any>;
type ExamMap = Record<string, Exam>;

export const runtime = "nodejs";

function parseInterrogatoire(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];

  try {
    // Parse un tableau JS stocké sous forme de string
    return Function('"use strict"; return (' + value + ')')();
  } catch (e) {
    console.error("Interrogatoire invalide :", value);
    return [];
  }
}

async function streamToBuffer(readableStream?: NodeJS.ReadableStream | null) {
  if (!readableStream) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const userProductId = searchParams.get("userProductId");
  const codeExamen = searchParams.get("codeExamen");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId parameter" },
      { status: 400 }
    );
  }

  try {
    const settings: any = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    const examsMap: ExamMap = {};

    if (settings && settings.exams) {
      const examsFromSettings =
        typeof settings.exams === "string"
          ? JSON.parse(settings.exams)
          : settings.exams; // déjà un objet

          // Si c'est un tableau
      if (Array.isArray(examsFromSettings)) {
        examsFromSettings.forEach((exam: any) => {
          if (exam.libelle == "Scanner des sinus de la face") {
            console.log(exam);
          } 

          if (exam.codeExamen) {
            examsMap[exam.codeExamen] = {
              typeExamen: exam.typeExamen || "",
              codeExamen: exam.codeExamen,
              libelle: exam.libelle || "",
              Synonymes: parseInterrogatoire(exam.Synonymes),
              Interrogatoire: parseInterrogatoire(exam.Interrogatoire),
              Commentaire: exam.Commentaire || "",
              performed: exam.performed ?? true,
              typeExamenClient: exam.typeExamenClient || "",
              libelleClient: exam.libelleClient || "",
              codeExamenClient: exam.codeExamenClient || "",
              horaireMapping: exam.horaire ?? null
            };
          }
        });
      } else if (typeof examsFromSettings === "object") {
        // Objet avec des clés
        Object.entries(examsFromSettings).forEach(([code, exam]: [string, any]) => {
          examsMap[code] = {
            typeExamen: exam.typeExamen || "",
            codeExamen: code,
            libelle: exam.libelle || "",
            Synonymes: parseInterrogatoire(exam.Synonymes),
            Interrogatoire: parseInterrogatoire(exam.Interrogatoire),
            Commentaire: exam.Commentaire || "",
            performed: exam.performed ?? true,
            typeExamenClient: exam.typeExamenClient || "",
            libelleClient: exam.libelleClient || "",
            codeExamenClient: exam.codeExamenClient || "",
              horaireMapping: exam.horaire ?? null
          };
        });
      }
    }

    // Charger Azure Blob
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.NEURACORP_EXAMS_CONTAINER || "neuracorp-exams";
    const blobName = process.env.NEURACORP_EXAMS_BLOB || "examens_neuracorp_azure.xlsx";

    if (!connectionString) {
      throw new Error("Missing Azure Storage connection string");
    }

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient =
      blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    const download = await blobClient.download();
    const buffer = await streamToBuffer(
      download.readableStreamBody as NodeJS.ReadableStream
    );

    let rows: any[] = [];

    if (blobName.endsWith(".csv")) {
      const csvText = buffer.toString("utf-8");
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });
      rows = parsed.data as any[];
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet);
    }

    rows.forEach((row: any) => {
      const code = row.codeExamen || row["codeExamen NEURACORP"];
      if (!code) return;
    
      if (!examsMap[code]) {
        examsMap[code] = {
          typeExamen: row.typeExamen || "",
          codeExamen: code,
          libelle: row.libelle || "",
          Synonymes: row.Synonymes || [],
          Interrogatoire: parseInterrogatoire(row.Interrogatoire),
          Commentaire: row.Commentaire || "",
          performed: row.performed ?? true,
          typeExamenClient: row.typeExamenClient || "",
          libelleClient: row.libelleClient || "",
          horaireMapping: null
        };
      }
    });
    
    // 🔍 Filtre par codeExamen si demandé
    if (codeExamen) {
      const exam = examsMap[codeExamen];

      if (!exam) {
        return NextResponse.json(
          { error: `No exam found for codeExamen "${codeExamen}"` },
          { status: 404 }
        );
      }

      return NextResponse.json({ [codeExamen]: exam });
    }

    // ✅ Retourne tableau fusionné
    return NextResponse.json(Object.values(examsMap));
  } catch (error: any) {
    console.error("Failed to fetch exams:", error);

    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

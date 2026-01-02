import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { BlobServiceClient } from "@azure/storage-blob";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Exam = Record<string, any>;
type ExamMap = Record<string, Exam>;

export const runtime = "nodejs";

async function streamToBuffer(readableStream?: NodeJS.ReadableStream | null) {
  if (!readableStream) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
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
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    const examsMap: ExamMap = {};

    // Charger BDD en priorité
    if (settings && Array.isArray(settings.exams)) {
      settings.exams.forEach((exam: any) => {
        if (exam.codeExamen) {
          examsMap[exam.codeExamen] = {
            ...exam,
          };
        }
      });
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
          Synonymes: row.Synonymes || "[]",
          Interrogatoire: row.Interrogatoire || "[]",
          Commentaire: row.Commentaire || "",
          performed: true,
          typeExamenClient: "",
          codeExamenClient: "",
          libelleClient: ""
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

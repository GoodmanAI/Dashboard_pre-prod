import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";
import Papa from "papaparse";

async function streamToBuffer(readableStream?: NodeJS.ReadableStream | null) {
  if (!readableStream) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userProductId = Number(searchParams.get("userProductId"));

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const settings = await prisma.talkSettings.findUnique({
    where: { userProductId },
    select: { exams: true },
  });

  /* ============================
   * 1️⃣ BDD = SOURCE UNIQUE
   * ============================ */
  const examsMap: Record<string, any> = {};

  if (settings?.exams) {
    // Format objet (recommandé)
    if (!Array.isArray(settings.exams)) {
      for (const [code, exam] of Object.entries(settings.exams)) {
        examsMap[code] = exam;
      }
    }

    // Format legacy tableau
    if (Array.isArray(settings.exams)) {
      for (const exam of settings.exams) {
        if (
          exam &&
          typeof exam === "object" &&
          "codeExamen" in exam &&
          typeof (exam as any).codeExamen === "string"
        ) {
          examsMap[(exam as any).codeExamen] = exam;
        }
      }
    }
  }

  /* ============================
   * 2️⃣ AZURE = FALLBACK
   * ============================ */
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName =
    process.env.NEURACORP_EXAMS_CONTAINER || "neuracorp-exams";
  const blobName =
    process.env.NEURACORP_EXAMS_BLOB || "examens_neuracorp_azure.xlsx";

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

  for (const row of rows) {
    const code = row.codeExamen || row["codeExamen NEURACORP"];
    if (!code) continue;

    // 🔒 VERROU ANTI-OVERRIDE
    if (!(code in examsMap)) {
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
        libelleClient: "",
      };
    }
  }

  return NextResponse.json(examsMap);
}

export async function POST(req: Request) {
  const { userProductId, exams } = await req.json();

  await prisma.talkSettings.update({
    where: { userProductId },
    data: {
      exams: exams,
    },
  });

  return NextResponse.json({ success: true });
}
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";
import Papa from "papaparse";

const prisma = new PrismaClient();

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

  /* ============================
   * 1️⃣ Charger DB (prioritaire)
   * ============================ */
  const settings = await prisma.talkSettings.findUnique({
    where: { userProductId },
    select: { exams: true },
  });

  const examsMap: Record<string, any> = {};

  if (settings?.exams) {
    // ✅ Cas 1 : exams est déjà un objet (format actuel recommandé)
    if (!Array.isArray(settings.exams)) {
      Object.assign(examsMap, settings.exams);
    }

    // ⚠️ Cas legacy : exams est un tableau
    if (Array.isArray(settings.exams)) {
      settings.exams.forEach((exam: any) => {
        if (exam.codeExamen) {
          examsMap[exam.codeExamen] = exam;
        }
      });
    }
  }

  /* ============================
   * 2️⃣ Charger Azure en complément
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

  /* ============================
   * 3️⃣ Fusion Azure → examsMap
   * ============================ */
  rows.forEach((row: any) => {
    const code = row.codeExamen || row["codeExamen NEURACORP"];
    if (!code) return;
    // ⚠️ Azure ne remplace JAMAIS la DB
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
        libelleClient: "",
      };
    }
  });

  /* ============================
   * 4️⃣ Retour FINAL → OBJET
   * ============================ */
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
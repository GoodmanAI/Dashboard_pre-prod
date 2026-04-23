import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse"; // CSV parser
import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS;
    const containerName = process.env.NEURACORP_EXAMS_CONTAINER!;
    const blobName = process.env.NEURACORP_EXAMS_BLOB!;

    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS manquant");
    }

    // Connexion au blob
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    // Téléchargement du fichier en mémoire
    const downloadResponse = await blobClient.download();
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);

    // Lecture Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    // Transformation en CSV (format demandé)
    const rows = data.map((item) => ({
      performed: "true",
      "typeExamen NEURACORP": item.typeExamen ?? "",
      "codeExamen NEURACORP": item.codeExamen ?? "",
      "libelle NEURACORP": item.libelle ?? "",
      "typeExamen Client": "",
      "codeExamen Client": "",
      "libelle Client": "",
    }));

    const csv = Papa.unparse(rows, {
      columns: [
        "performed",
        "typeExamen NEURACORP",
        "codeExamen NEURACORP",
        "libelle NEURACORP",
        "typeExamen Client",
        "codeExamen Client",
        "libelle Client",
      ],
    });

    console.log(csv);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="neuracorp-exams.csv"',
      },
    });
  } catch (error) {
    console.error("Erreur API neuracorp-exams:", error);
    return NextResponse.json(
      { error: "Impossible de lire le blob ou de générer le CSV" },
      { status: 500 }
    );
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
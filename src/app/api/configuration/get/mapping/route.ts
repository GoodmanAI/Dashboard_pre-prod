import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  requireAuthOrApiKey,
  assertUserProductOwnership,
} from "@/lib/auth-helpers";
import { referentielEnBase } from "@/lib/referentielExamens";

type Exam = Record<string, any>;
type ExamMap = Record<string, Exam>;

export const runtime = "nodejs";

function parseInterrogatoire(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];

  try {
    // Parse un tableau JS stocké sous forme de string
    return Function('"use strict"; return (' + value + ")")();
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
  const auth = await requireAuthOrApiKey(req, "BOT_API_KEY");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);

  const userProductId = searchParams.get("userProductId");
  const codeExamen = searchParams.get("codeExamen");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId parameter" },
      { status: 400 },
    );
  }

  // Bot : pas de check d'ownership (il appelle pour le centre qu'il gère).
  // User : on vérifie qu'il a accès au UserProduct demandé.
  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(
      auth.session,
      Number(userProductId),
    );
    if (ownershipErr) return ownershipErr;
  }

  try {
    const settings: any = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    console.log(
      "Settings loaded for userProductId",
      userProductId,
      settings ? "✅" : "❌",
    );
    console.log(settings);
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
              horaireMapping: exam.horaire ?? null,
              codeExamenClientInject: exam.codeExamenClientInject ?? null,
            };
          }
        });
      } else if (typeof examsFromSettings === "object") {
        // Objet avec des clés
        Object.entries(examsFromSettings).forEach(
          ([code, exam]: [string, any]) => {
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
              horaireMapping: exam.horaire ?? null,
              codeExamenClientInject: exam.codeExamenClientInject ?? null,
            };
          },
        );
      }
    }

    // --- La nomenclature, pour compléter ce que le client n'a pas encore saisi ---
    //
    // LUE EN BASE DEPUIS LE 11/09/2026 (`ReferentielExamens`), plus dans un blob Azure
    // à chaque appel. Cette route est interrogée par le ROBOT : elle faisait donc
    // dépendre la configuration d'un appel téléphonique de la disponibilité d'Azure,
    // pour une liste qui change quelques fois par an.
    //
    // Elle lisait par ailleurs `AZURE_STORAGE_CONNECTION_STRING`, quand le reste du
    // code lit `AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS`. Deux variables pour
    // le même blob, dont une seule est présente en production : c'est ce qui faisait
    // que Q35 (« le référentiel est injoignable ») ne se voyait pas sur cet écran.
    const referentiel = await referentielEnBase();

    // Repli sur le blob tant que la table n'est pas semée : le déploiement du code peut
    // ainsi précéder celui de la donnée sans rien casser.
    let rows: any[] = referentiel.map((l) => ({
      codeExamen: l.codeExamen,
      typeExamen: l.typeExamen ?? "",
      libelle: l.libelle ?? "",
    }));

    if (rows.length === 0) {
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
        download.readableStreamBody as NodeJS.ReadableStream,
      );

      if (blobName.endsWith(".csv")) {
        const parsed = Papa.parse(buffer.toString("utf-8"), {
          header: true,
          skipEmptyLines: true,
        });
        rows = parsed.data as any[];
      } else {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        rows = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
        );
      }
    }

    // Le centre a-t-il déjà un mapping ? La réponse change le sens d'une ligne ajoutée
    // ici, et donc ce que le robot en fait.
    const centreDejaConfigure = Object.keys(examsMap).length > 0;

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
          // ⚠️ `false` QUAND LE CENTRE A DÉJÀ UN MAPPING, ET C'EST UNE GARDE.
          //
          // Le robot lit `performed` : à `true` il ANNONCE l'examen au patient et tente
          // la réservation (`confirmExam` : « Examen non bookable (performed=false) →
          // redirection »). Or une ligne venue de la nomenclature n'a, par définition,
          // jamais été configurée par ce centre : elle n'a aucun code RIS, donc aucun
          // rendez-vous possible.
          //
          // Le référentiel est passé de 264 (blob) à 287 entrées le 11/09/2026. Sans
          // cette distinction, 21 examens seraient soudain annoncés « pratiqués » chez
          // chacun des clients en service, et le robot promettrait au téléphone des
          // rendez-vous qu'il ne sait pas prendre.
          //
          // SUR UN CENTRE VIERGE, `true` reste le bon défaut : le client décoche ce
          // qu'il ne pratique pas, ce qui est plus rapide que de tout cocher. C'est le
          // choix d'origine, et il ne change pas.
          performed: centreDejaConfigure ? false : (row.performed ?? true),
          typeExamenClient: row.typeExamenClient || "",
          libelleClient: row.libelleClient || "",
          horaireMapping: null,
          codeExamenClientInject: null,
        };
      }
    });

    // 🔍 Filtre par codeExamen si demandé
    if (codeExamen) {
      const exam = examsMap[codeExamen];

      if (!exam) {
        return NextResponse.json(
          { error: `No exam found for codeExamen "${codeExamen}"` },
          { status: 404 },
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
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

import { journaliserEcritureConfig } from "@/lib/auditConfig";
import { referentielEnBase } from "@/lib/referentielExamens";
import {
  completerAvecReferentiel,
  type LigneNomenclature,
} from "@/lib/referentielRepli";

async function streamToBuffer(readableStream?: NodeJS.ReadableStream | null) {
  if (!readableStream) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}


/** Repli quand `ReferentielExamens` est vide. Liste vide si le blob est injoignable. */
async function nomenclatureDuBlob(): Promise<LigneNomenclature[]> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName =
    process.env.NEURACORP_EXAMS_CONTAINER || "neuracorp-exams";
  const blobName =
    process.env.NEURACORP_EXAMS_BLOB || "examens_neuracorp_azure.xlsx";
  if (!connectionString) return [];

  try {
    const blobClient = BlobServiceClient.fromConnectionString(connectionString)
      .getContainerClient(containerName)
      .getBlobClient(blobName);
    const buffer = await streamToBuffer(
      (await blobClient.download()).readableStreamBody as NodeJS.ReadableStream,
    );
    let brut: any[];
    if (blobName.endsWith(".csv")) {
      brut = Papa.parse(buffer.toString("utf-8"), {
        header: true,
        skipEmptyLines: true,
      }).data as any[];
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      brut = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    }
    return brut.map((row) => ({
      codeExamen: row.codeExamen || row["codeExamen NEURACORP"] || "",
      typeExamen: row.typeExamen ?? "",
      libelle: row.libelle ?? "",
      Synonymes: row.Synonymes,
      Interrogatoire: row.Interrogatoire,
      Commentaire: row.Commentaire,
      repliSur: [],
    }));
  } catch (err) {
    console.error("[configuration/exam] blob illisible :", err);
    return [];
  }
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const userProductId = Number(searchParams.get("userProductId"));

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const ownershipErr = await assertUserProductOwnership(session, userProductId);
  if (ownershipErr) return ownershipErr;

  const droitErr = await requirePagePermission(PAGES.QUESTIONS_EXAM, "read");
  if (droitErr) return droitErr;

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
   * 2️⃣ LA NOMENCLATURE, POUR COMPLÉTER
   * ============================
   *
   * ⚠️ DÉFAUT CORRIGÉ LE 02/11/2026. Cette route lisait le blob Azure et ajoutait ses
   * lignes à `performed: true`, puis le POST réécrivait `TalkSettings.exams` en
   * entier : un examen ajouté au blob devenait actif sans code RIS au premier
   * enregistrement des questions, et le robot l'annonçait au patient.
   *
   * Elle lit désormais `ReferentielExamens`, comme `get/mapping`, et complète par la
   * même fonction : ligne ajoutée non pratiquée chez un centre déjà configuré, repli
   * sur le parent (`repliSur`). Le blob ne sert plus qu'en repli quand la table est
   * vide, et jamais à `performed: true` chez un centre configuré.
   */
  const centreDejaConfigure = Object.keys(examsMap).length > 0;
  let rows: LigneNomenclature[] = (await referentielEnBase()).map((l) => ({
    codeExamen: l.codeExamen,
    typeExamen: l.typeExamen ?? "",
    libelle: l.libelle ?? "",
    repliSur: l.repliSur ?? [],
  }));
  if (rows.length === 0) rows = await nomenclatureDuBlob();

  completerAvecReferentiel(examsMap, rows, { centreDejaConfigure });

  return NextResponse.json(examsMap);
}

export async function POST(req: Request) {
  const droitEcritureErr = await requirePagePermission(PAGES.QUESTIONS_EXAM, "write");
  if (droitEcritureErr) return droitEcritureErr;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const { userProductId, exams } = await req.json();

  if (!userProductId || !Number.isFinite(Number(userProductId))) {
    return NextResponse.json({ error: "Invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(session, Number(userProductId));
  if (ownershipErr) return ownershipErr;

  if (!exams || typeof exams !== "object" || Array.isArray(exams)) {
    return NextResponse.json({ error: "Invalid exams" }, { status: 400 });
  }

  // Ce que l'écran renvoie est ce que le GET a servi : le mapping enregistré plus les
  // lignes complétées par la nomenclature. Deux choses à ne pas écrire telles quelles
  // (02/11/2026) :
  // - `repliSur` : il vient du référentiel et se recalcule à chaque lecture ;
  // - sur une ligne qui n'était PAS en base, les colonnes héritées du parent (code RIS,
  //   code injecté, type client, salles). Les figer ici, sur un écran qui ne les montre
  //   pas, ferait qu'elle ne suivrait plus son parent. Vides, la ligne reste « non
  //   paramétrée » et continue d'hériter à la lecture.
  const actuel = await prisma.talkSettings.findUnique({
    where: { userProductId: Number(userProductId) },
    select: { exams: true },
  });
  const enBase = new Set<string>(
    Array.isArray(actuel?.exams)
      ? (actuel!.exams as any[])
          .map((e) => (e && typeof e === "object" ? e.codeExamen : null))
          .filter((c): c is string => typeof c === "string")
      : actuel?.exams && typeof actuel.exams === "object"
        ? Object.keys(actuel.exams as object)
        : [],
  );
  const aEcrire: Record<string, any> = {};
  for (const [code, brut] of Object.entries(exams as Record<string, any>)) {
    if (!brut || typeof brut !== "object") continue;
    const ligne: Record<string, any> = { ...brut };
    delete ligne.repliSur;
    if (!enBase.has(code)) {
      ligne.codeExamenClient = "";
      ligne.codeExamenClientInject = null;
      ligne.typeExamenClient = "";
      ligne.postes = [];
    }
    aEcrire[code] = ligne;
  }

  await prisma.talkSettings.update({
    where: { userProductId: Number(userProductId) },
    data: {
      exams: aEcrire,
    },
  });

  // Qui a change quoi. Sans cette ligne, une modification de configuration
  // faite par un sous-compte ne laissait aucune trace. Voir auditConfig.ts.
  journaliserEcritureConfig(req, session, "talk-questions-examens-update", Number(userProductId));

  return NextResponse.json({ success: true });
}
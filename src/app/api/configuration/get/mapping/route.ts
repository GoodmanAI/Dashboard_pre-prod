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
import {
  completerAvecReferentiel,
  lireListe,
  type LigneNomenclature,
} from "@/lib/referentielRepli";
import { versionMapping, EN_TETE_VERSION_MAPPING } from "@/lib/versionMapping";
import { postesTalk, type SallesTalk } from "@/lib/sallesFacturees";
import { sallesTalkDuCentre } from "@/lib/sallesExamenLecture";

type Exam = Record<string, any>;
type ExamMap = Record<string, Exam>;

export const runtime = "nodejs";

// Ancien `parseInterrogatoire`, déplacé dans `referentielRepli.ts` (02/11/2026) pour
// être partagé avec l'écran Questions examens.
const parseInterrogatoire = lireListe;

async function streamToBuffer(readableStream?: NodeJS.ReadableStream | null) {
  if (!readableStream) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Une ligne du classeur, ramenée à la forme de la nomenclature (sans repli). */
function depuisLeBlob(row: any): LigneNomenclature {
  return {
    codeExamen: row.codeExamen || row["codeExamen NEURACORP"] || "",
    typeExamen: row.typeExamen ?? "",
    libelle: row.libelle ?? "",
    Synonymes: row.Synonymes,
    Interrogatoire: row.Interrogatoire,
    Commentaire: row.Commentaire,
    performed: row.performed,
    repliSur: [],
  };
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

    // Les salles déclarées par l'admin (`talk.site.sallesParType`). Les `postes` de
    // chaque examen sont réduits à celles de son type : une salle retirée de la
    // déclaration ne filtre plus rien (plan `2026-10-filtrage-creneaux-par-salle`).
    //
    // Une lecture en échec rend `{}`, donc des `postes` vides : le robot cherche
    // alors dans toutes les salles, comme avant le chantier. Mieux vaut un créneau
    // dans une salle discutable que plus de mapping du tout pendant un appel.
    //
    // Salles payées (02/11/2026, plan `2026-11-salles-facturees-talk-konnect`) : quand
    // le client a au moins une salle cochée pour Talk, un examen sans salle choisie
    // reçoit toutes les salles payées de son type, jamais « aucun filtre ».
    let salles: SallesTalk = { sallesParType: {}, actif: false };
    try {
      salles = await sallesTalkDuCentre(Number(userProductId));
    } catch (e) {
      console.error("[get/mapping] salles illisibles, aucun filtre :", e);
    }

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
              postes: postesTalk(exam.postes, salles, exam.typeExamen),
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
              postes: postesTalk(exam.postes, salles, exam.typeExamen),
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
    let rows: LigneNomenclature[] = referentiel.map((l) => ({
      codeExamen: l.codeExamen,
      typeExamen: l.typeExamen ?? "",
      libelle: l.libelle ?? "",
      repliSur: l.repliSur ?? [],
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
        rows = (parsed.data as any[]).map(depuisLeBlob);
      } else {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        rows = XLSX.utils
          .sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]])
          .map(depuisLeBlob);
      }
    }

    // Le centre a-t-il déjà un mapping ? La réponse change le sens d'une ligne ajoutée
    // ici, et donc ce que le robot en fait.
    const centreDejaConfigure = Object.keys(examsMap).length > 0;

    // Complétion, repli des examens ajoutés sur leurs parents et `repliSur` sur
    // chaque ligne : `src/lib/referentielRepli.ts` (02/11/2026).
    //
    // ⚠️ Une ligne ajoutée arrive `performed: false` chez un centre déjà configuré, et
    // c'est une garde. Le robot lit `performed` : à `true` il ANNONCE l'examen au
    // patient et tente la réservation (`confirmExam` : « Examen non bookable
    // (performed=false) → redirection »). Le référentiel est passé de 264 (blob) à 287
    // entrées le 11/09/2026 : sans cette distinction, 21 examens seraient soudain
    // annoncés « pratiqués » chez chaque client en service. SUR UN CENTRE VIERGE,
    // `true` reste le bon défaut : le client décoche ce qu'il ne pratique pas.
    const ajoutables = new Set(
      rows.map((r) => r.codeExamen).filter((c) => c && !examsMap[c]),
    );
    completerAvecReferentiel(examsMap, rows, { centreDejaConfigure });
    // `horaire` n'est jamais réglé sur une ligne venue de la nomenclature.
    for (const code of Array.from(ajoutables)) {
      examsMap[code].horaireMapping = null;
      // Jamais réglée par ce centre : aucun filtre, sauf salles payées (02/11/2026) :
      // alors celles de son type. Une ligne repliée garde les salles de son parent.
      examsMap[code].postes = postesTalk(examsMap[code].postes, salles, examsMap[code].typeExamen);
    }

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
    //
    // L'en-tête sert l'écran de mapping, qui le renvoie à l'enregistrement pour qu'un
    // onglet resté ouvert n'écrase pas le travail d'un collègue (voir versionMapping.ts).
    // Le robot l'ignore : le corps ne change pas.
    return NextResponse.json(Object.values(examsMap), {
      headers: { [EN_TETE_VERSION_MAPPING]: versionMapping(settings?.exams ?? null) },
    });
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

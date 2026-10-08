import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { APPOINTMENT_MAX_ATTEMPTS } from "@/lib/appointmentToken";
import { verifyVerificationCode } from "@/lib/verificationCodeHash";
import { scanBuffer } from "@/lib/clamavScan";
import { checkRateLimit } from "@/lib/prescriptionRateLimit";
import { detectFileType } from "@/lib/prescriptionFileType";
import {
  MAX_DOCUMENTS_PAR_LIEN,
  lienOuvert,
} from "@/lib/prescriptionDocuments";

/**
 * Endpoint patient public (auth = shortCode dans l'URL + verificationCode
 * dans le body). Servi sur le sous-domaine depot-ordonnances.neuracorp.ai
 * qui est isole par le middleware — seules les routes /d/[shortCode] et
 * /api/prescriptions/[token]/{status,upload} sont accessibles.
 *
 * Body attendu (multipart/form-data) :
 *   code: string    — 6 chiffres du SMS
 *   file: File      — ordonnance en PDF/JPG/PNG (100 B .. 8 MB)
 *
 * Formats acceptes (compatibles Xplore RIS/PACS) : PDF, JPEG, PNG.
 * HEIC (iPhone) et WebP (Android) rejetes avec message d'aide dedie
 * (patient invite a reprendre en JPG ou envoyer un PDF).
 *
 * Chaine de validation (fail au 1er echec) :
 *   1. Token existe                    → 404 sinon
 *   2. Lien ouvert (ni LOCKED, ni EXPIRED, RDV pas encore passe) → 409 sinon
 *   3. Code correct                    → 422 + attempts++ sinon (LOCKED a 3)
 *   4. Moins de 5 documents deja recus → 409 sinon
 *   5. Fichier present, taille bornee  → 400/413 sinon
 *   6. Magic bytes PDF/JPEG/PNG        → 415 sinon (message dedie HEIC/WebP)
 *   7. Antivirus ClamAV clean          → 422 sinon (log alerte)
 *
 * Si tout passe : ecrit sur disque, AJOUTE une ligne PrescriptionDocument,
 * passe le lien en UPLOADED au premier document, log l'audit, incremente
 * PrescriptionStats.uploaded au premier document du lien.
 *
 * Plusieurs documents (depuis le 08/10/2026) : un envoi = un fichier = un
 * document. Le lien en accepte MAX_DOCUMENTS_PAR_LIEN, en plusieurs fois,
 * jusqu'a l'heure du RDV. Plus de remplacement : un document deja parti
 * dans Xplore ne se retire pas d'ici. Le plafond est verifie sous verrou de
 * la ligne du lien (deux envois simultanes ne font pas un sixieme).
 */

const STORAGE_DIR =
  process.env.PRESCRIPTIONS_STORAGE_DIR ?? "/var/www/ordonnances";
const MIN_FILE_SIZE = 100; // < ca c'est pas un PDF utilisable
// Cap fichier fixe a 8 MB (au lieu de 10 MB initialement) : contrainte Xplore
// qui refuse toute ordonnance dont le base64 depasse 12 MB (le PDF binaire
// est encode base64 dans le payload SendOrdonnance). 8 MB * 1.33 = 10.7 MB
// base64, sous les 12 MB avec marge. Nginx reste a 10 MB (client_max_body_size)
// pour absorber les headers multipart, le blocage strict est ici.
const MAX_FILE_SIZE = 8 * 1024 * 1024;

/** Extrait la premiere IP de x-forwarded-for. */
function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

// La detection de format (PDF / JPEG / PNG / HEIC-rejete / WebP-rejete) est
// deleguee au helper src/lib/prescriptionFileType.ts qui verifie les magic
// bytes independamment du Content-Type client (manipulable).

/**
 * Log dans PrescriptionAccessLog. Ne throw jamais : un echec de log ne doit
 * pas invalider la reponse au patient.
 */
async function auditLog(params: {
  uploadId: number | null;
  documentId?: number | null;
  action: string;
  actorIp: string | null;
  actorUserAgent: string | null;
  success: boolean;
  errorReason?: string | null;
}): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "documentId", "action", "actorType", "actorIp",
         "actorUserAgent", "success", "errorReason")
      VALUES ($1, $7, $2, 'patient', $3::inet, $4, $5, $6)
      `,
      [
        params.uploadId,
        params.action,
        params.actorIp,
        params.actorUserAgent,
        params.success,
        params.errorReason ?? null,
        params.documentId ?? null,
      ]
    );
  } catch (err) {
    console.error("[prescriptions/upload] audit log failed:", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const actorIp = extractClientIp(req);
  const actorUserAgent = req.headers.get("user-agent");

  // ------ 0. Rate limit IP ------
  // Bloque avant tout requetage DB pour ne pas surcharger sous flood.
  const rateCheck = await checkRateLimit(actorIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: rateCheck.reason },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      }
    );
  }

  // ------ 1. Chargement de la ligne ------
  const sel = await db.query<{
    id: number;
    status: string;
    attempts: number;
    expiresAt: Date;
    verificationCodeHash: string;
    externalCenterCode: string;
    examType: string | null;
    nbDocuments: number;
  }>(
    `SELECT pu."id", pu."status", pu."attempts", pu."expiresAt",
            pu."verificationCodeHash", pu."externalCenterCode", pu."examType",
            (SELECT COUNT(*)::int FROM "PrescriptionDocument" d
              WHERE d."uploadId" = pu."id") AS "nbDocuments"
       FROM "PrescriptionUpload" pu
      WHERE pu."token" = $1
      LIMIT 1`,
    [params.token]
  );

  if (sel.rowCount === 0) {
    await auditLog({
      uploadId: null,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: "unknown token",
    });
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const record = sel.rows[0];

  // ------ 2. Lien ouvert ------
  // LOCKED (trois mauvais codes) et EXPIRED refusent. Un lien dont l'heure de
  // RDV est passee bascule en EXPIRED ici. ACKED et REJECTED (anciennes
  // lignes, un seul document) restent ouverts : le patient peut completer.
  if (!lienOuvert(record.status, record.expiresAt)) {
    const expire = record.status !== "LOCKED";
    if (expire && record.status !== "EXPIRED") {
      await db.query(
        `UPDATE "PrescriptionUpload" SET "status" = 'EXPIRED' WHERE "id" = $1`,
        [record.id]
      );
    }
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: expire ? "expired" : `status=${record.status}`,
    });
    return NextResponse.json(
      expire
        ? {
            error:
              "Ce lien a expiré : l'heure de votre rendez-vous est passée.",
            status: "EXPIRED",
          }
        : {
            error: "Ce lien est verrouillé. Contactez votre centre.",
            status: "LOCKED",
          },
      { status: 409 }
    );
  }

  // ------ 3. Parse multipart form ------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Requete invalide (multipart attendu)" },
      { status: 400 }
    );
  }

  const codeRaw = formData.get("code");
  const fileRaw = formData.get("file");
  if (typeof codeRaw !== "string" || !(fileRaw instanceof File)) {
    return NextResponse.json(
      { error: "Champs manquants : code et file requis" },
      { status: 400 }
    );
  }

  // ------ 4. Verification code ------
  const submittedCode = codeRaw.trim();
  const codeOk = verifyVerificationCode(
    submittedCode,
    record.verificationCodeHash
  );
  if (!codeOk) {
    const nextAttempts = record.attempts + 1;
    const locked = nextAttempts >= APPOINTMENT_MAX_ATTEMPTS;
    await db.query(
      `UPDATE "PrescriptionUpload"
          SET "attempts" = $2,
              "status"   = $3
        WHERE "id" = $1`,
      [record.id, nextAttempts, locked ? "LOCKED" : record.status]
    );
    await auditLog({
      uploadId: record.id,
      action: "code_failed",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: locked ? "LOCKED after 3 fails" : `attempt ${nextAttempts}`,
    });
    return NextResponse.json(
      {
        error: "Code incorrect.",
        status: locked ? "LOCKED" : record.status,
        attemptsLeft: locked ? 0 : APPOINTMENT_MAX_ATTEMPTS - nextAttempts,
      },
      { status: 422 }
    );
  }

  // ------ 5. Plafond (lecture rapide, reverifie sous verrou a l'ecriture) ------
  if (record.nbDocuments >= MAX_DOCUMENTS_PAR_LIEN) {
    return plafondAtteint();
  }

  // ------ 6. Validation fichier (taille + MIME + structure PDF) ------
  if (fileRaw.size < MIN_FILE_SIZE) {
    return NextResponse.json(
      {
        error:
          "Ce fichier est trop petit pour être une ordonnance. Choisissez-en un autre.",
      },
      { status: 400 }
    );
  }
  if (fileRaw.size > MAX_FILE_SIZE) {
    const maxMb = MAX_FILE_SIZE / 1024 / 1024;
    return NextResponse.json(
      {
        error: `Fichier trop lourd (${maxMb} Mo au plus). Réduisez la qualité de la photo ou scannez en noir et blanc.`,
      },
      { status: 413 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await fileRaw.arrayBuffer());
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de lire le fichier. Réessayez ou choisissez-en un autre.",
      },
      { status: 400 }
    );
  }

  // Detection par magic bytes : PDF, JPEG, PNG acceptes.
  // HEIC (iPhone) et WebP (Android) rejetes avec message d'aide dedie.
  const validation = detectFileType(buffer);
  if (!validation.ok) {
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: validation.rejectedFormat
        ? `rejected format: ${validation.rejectedFormat}`
        : `invalid file: ${validation.reason}`,
    });
    return NextResponse.json(
      {
        error: validation.reason,
        rejectedFormat: validation.rejectedFormat,
      },
      { status: 415 }
    );
  }

  // ------ 7. Antivirus ------
  const scanResult = await scanBuffer(buffer);
  if (!scanResult.ok) {
    // Erreur scanner (socket down, timeout, ...) : on n'ecrit pas le fichier
    // et on demande au patient de reessayer. Log l'incident pour investiguer.
    console.error(
      "[prescriptions/upload] clamav scan error:",
      scanResult.error
    );
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: `clamav error: ${scanResult.error}`,
    });
    return NextResponse.json(
      {
        error:
          "La vérification du fichier est indisponible. Réessayez dans un instant.",
      },
      { status: 503 }
    );
  }
  if (!scanResult.clean) {
    // Fichier infecte : rejet sec, log alerte, aucun ecrit disque.
    console.warn(
      `[prescriptions/upload] INFECTED file rejected — token=${params.token} virus=${scanResult.virus} ip=${actorIp}`
    );
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: `infected: ${scanResult.virus}`,
    });
    return NextResponse.json(
      {
        error: "Ce fichier a été refusé par l'antivirus. Envoyez-en un autre.",
      },
      { status: 422 }
    );
  }

  // ------ 8. Ecriture disque ------
  const uuid = randomUUID();
  const storagePath = path.join(STORAGE_DIR, `${uuid}.${validation.extension}`);
  const fileSha256 = createHash("sha256").update(buffer).digest("hex");
  try {
    await writeFile(storagePath, buffer, { mode: 0o600 });
  } catch (err) {
    console.error("[prescriptions/upload] disk write failed:", err);
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: "disk write failed",
    });
    return NextResponse.json(
      { error: "L'enregistrement a échoué. Réessayez dans un instant." },
      { status: 500 }
    );
  }

  // ------ 9. Ajout du document, sous verrou du lien ------
  // FOR UPDATE sur la ligne du lien : deux envois simultanes se suivent, et
  // le second voit le document du premier dans le compte.
  let documentId: number | null = null;
  let nbDocuments = 0;
  let premierDocument = false;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const verrou = await client.query<{ status: string }>(
      `SELECT "status" FROM "PrescriptionUpload" WHERE "id" = $1 FOR UPDATE`,
      [record.id]
    );
    const compte = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS "n" FROM "PrescriptionDocument" WHERE "uploadId" = $1`,
      [record.id]
    );
    const deja = compte.rows[0]?.n ?? 0;
    if (deja < MAX_DOCUMENTS_PAR_LIEN) {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO "PrescriptionDocument"
           ("uploadId", "fileSize", "fileSha256", "storagePath")
         VALUES ($1, $2, $3, $4)
         RETURNING "id"`,
        [record.id, fileRaw.size, fileSha256, storagePath]
      );
      documentId = ins.rows[0].id;
      nbDocuments = deja + 1;
      premierDocument = verrou.rows[0]?.status === "PENDING";
      // Le lien passe en UPLOADED au premier document ; "uploadedAt" garde
      // l'heure du premier envoi (sortie de l'alerte « ordonnance manquante »).
      await client.query(
        `UPDATE "PrescriptionUpload"
            SET "status"     = CASE WHEN "status" = 'PENDING' THEN 'UPLOADED' ELSE "status" END,
                "uploadedAt" = COALESCE("uploadedAt", NOW()),
                "attempts"   = 0
          WHERE "id" = $1`,
        [record.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[prescriptions/upload] insert document failed:", err);
    await unlink(storagePath).catch(() => {});
    return NextResponse.json(
      { error: "L'enregistrement a échoué. Réessayez dans un instant." },
      { status: 500 }
    );
  } finally {
    client.release();
  }

  if (documentId === null) {
    // Plafond atteint entre la lecture et l'ecriture : le fichier ne sert pas.
    await unlink(storagePath).catch(() => {});
    return plafondAtteint();
  }

  // ------ 10. Compteur agregat (une fois par lien, au premier document) ------
  if (premierDocument) {
    try {
      await db.query(
        `
        INSERT INTO "PrescriptionStats"
          ("externalCenterCode", "examType", "day",
           "requested", "uploaded", "acked", "alerted", "updatedAt")
        VALUES (
          $1, $2,
          (NOW() AT TIME ZONE 'Europe/Paris')::date,
          0, 1, 0, 0, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "uploaded" = "PrescriptionStats"."uploaded" + 1,
              "updatedAt" = NOW()
        `,
        [record.externalCenterCode, record.examType]
      );
    } catch (err) {
      console.error(
        "[prescriptions/upload] PrescriptionStats upsert failed:",
        err
      );
    }
  }

  // ------ 11. Audit log success ------
  await auditLog({
    uploadId: record.id,
    documentId,
    action: "upload",
    actorIp,
    actorUserAgent,
    success: true,
    errorReason: premierDocument ? null : `document ${nbDocuments}`,
  });

  // ------ 12. Notification websocket au dashboard ------
  // Le premier document fait sortir le lien du compteur d'alertes (badge
  // navbar/header). On notifie tous les clients dashboard connectes pour un
  // rafraichissement instantane, sans attendre le poll de fallback.
  // Payload minimale : externalCenterCode pour permettre au client de filtrer.
  if (premierDocument) {
    const io: any = globalThis.io;
    if (io) {
      io.emit("prescription-alerts-updated", {
        externalCenterCode: record.externalCenterCode,
      });
    }
  }

  return NextResponse.json(
    {
      status: "UPLOADED",
      nbDocuments,
      maxDocuments: MAX_DOCUMENTS_PAR_LIEN,
      message: "Document envoyé. Il sera transmis au centre.",
    },
    { status: 200 }
  );
}

function plafondAtteint() {
  return NextResponse.json(
    {
      error: `Vous avez déjà envoyé ${MAX_DOCUMENTS_PAR_LIEN} documents, c'est le maximum. Pour en ajouter un, contactez votre centre.`,
      status: "FULL",
      nbDocuments: MAX_DOCUMENTS_PAR_LIEN,
    },
    { status: 409 }
  );
}

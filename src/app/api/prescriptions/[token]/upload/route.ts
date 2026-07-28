import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { APPOINTMENT_MAX_ATTEMPTS } from "@/lib/appointmentToken";
import { verifyVerificationCode } from "@/lib/verificationCodeHash";
import { scanBuffer } from "@/lib/clamavScan";
import { checkRateLimit } from "@/lib/prescriptionRateLimit";

/**
 * Endpoint patient public (auth = shortCode dans l'URL + verificationCode
 * dans le body). Servi sur le sous-domaine depot-ordonnances.neuracorp.ai
 * qui est isole par le middleware — seules les routes /d/[shortCode] et
 * /api/prescriptions/[token]/{status,upload} sont accessibles.
 *
 * Body attendu (multipart/form-data) :
 *   code: string    — 6 chiffres du SMS
 *   file: File      — PDF ordonnance (100 B .. 10 MB)
 *
 * Chaine de validation (fail au 1er echec) :
 *   1. Token existe                    → 404 sinon
 *   2. Statut PENDING ou UPLOADED-non-acke → 409 sinon
 *   3. Pas expire                      → 409 sinon (status → EXPIRED)
 *   4. Code correct                    → 422 + attempts++ sinon (LOCKED a 3)
 *   5. Fichier present, taille bornee  → 400/413 sinon
 *   6. MIME PDF (magic %PDF- + trailer %%EOF) → 415 sinon
 *   7. Antivirus ClamAV clean          → 422 sinon (log alerte)
 *
 * Si tout passe : ecrit sur disque, met a jour la ligne, log l'audit,
 * incremente le compteur PrescriptionStats.uploaded.
 *
 * Re-upload : si status='UPLOADED' et pas encore ackedAt, on autorise le
 * remplacement. Ancien fichier disque supprime, nouveau ecrit avec nouveau
 * UUID. Une fois ackedAt IS NOT NULL, plus de re-upload possible (409).
 */

const STORAGE_DIR = process.env.PRESCRIPTIONS_STORAGE_DIR ?? "/var/www/ordonnances";
const MIN_FILE_SIZE = 100;              // < ca c'est pas un PDF utilisable
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, aligne sur nginx client_max_body_size

/** Extrait la premiere IP de x-forwarded-for. */
function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** Verifie que le buffer est un PDF (magic bytes + trailer). */
function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < MIN_FILE_SIZE) return false;
  // Header %PDF- dans les 5 premiers bytes
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return false;
  // Trailer %%EOF quelque part dans les 1024 derniers bytes
  const tail = buffer.subarray(-1024).toString("binary");
  return tail.includes("%%EOF");
}

/**
 * Log dans PrescriptionAccessLog. Ne throw jamais : un echec de log ne doit
 * pas invalider la reponse au patient.
 */
async function auditLog(params: {
  uploadId: number | null;
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
        ("uploadId", "action", "actorType", "actorIp", "actorUserAgent",
         "success", "errorReason")
      VALUES ($1, $2, 'patient', $3::inet, $4, $5, $6)
      `,
      [
        params.uploadId,
        params.action,
        params.actorIp,
        params.actorUserAgent,
        params.success,
        params.errorReason ?? null,
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
    ackedAt: Date | null;
    storagePath: string | null;
  }>(
    `SELECT "id", "status", "attempts", "expiresAt", "verificationCodeHash",
            "externalCenterCode", "examType", "ackedAt", "storagePath"
       FROM "PrescriptionUpload"
      WHERE "token" = $1
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

  // ------ 2. Statut ------
  // PENDING = premier upload. UPLOADED sans ackedAt = re-upload autorise.
  // Tout autre statut (ACKED / EXPIRED / LOCKED) refuse.
  const canUpload =
    record.status === "PENDING" ||
    (record.status === "UPLOADED" && record.ackedAt === null);
  if (!canUpload) {
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: `status=${record.status}`,
    });
    const message =
      record.status === "ACKED"
        ? "Votre ordonnance a deja ete recuperee par le centre. Contactez-le pour toute modification."
        : "Ce lien n'est plus utilisable.";
    return NextResponse.json(
      { error: message, status: record.status },
      { status: 409 }
    );
  }

  // ------ 3. Expiration ------
  if (record.expiresAt < new Date()) {
    await db.query(
      `UPDATE "PrescriptionUpload" SET "status" = 'EXPIRED' WHERE "id" = $1`,
      [record.id]
    );
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: "expired",
    });
    return NextResponse.json(
      { error: "Ce lien a expire.", status: "EXPIRED" },
      { status: 409 }
    );
  }

  // ------ 4. Parse multipart form ------
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

  // ------ 5. Verification code ------
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

  // ------ 6. Validation fichier (taille + MIME + structure PDF) ------
  if (fileRaw.size < MIN_FILE_SIZE) {
    return NextResponse.json(
      { error: "Fichier trop petit pour etre une ordonnance." },
      { status: 400 }
    );
  }
  if (fileRaw.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB).` },
      { status: 413 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await fileRaw.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Impossible de lire le fichier." },
      { status: 400 }
    );
  }

  if (!isValidPdf(buffer)) {
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: "invalid PDF format",
    });
    return NextResponse.json(
      { error: "Le fichier doit etre un PDF valide." },
      { status: 415 }
    );
  }

  // ------ 7. Antivirus ------
  const scanResult = await scanBuffer(buffer);
  if (!scanResult.ok) {
    // Erreur scanner (socket down, timeout, ...) : on n'ecrit pas le fichier
    // et on demande au patient de reessayer. Log l'incident pour investiguer.
    console.error("[prescriptions/upload] clamav scan error:", scanResult.error);
    await auditLog({
      uploadId: record.id,
      action: "upload",
      actorIp,
      actorUserAgent,
      success: false,
      errorReason: `clamav error: ${scanResult.error}`,
    });
    return NextResponse.json(
      { error: "Verification antivirus indisponible, reessayez dans un instant." },
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
      { error: "Fichier rejete par la verification antivirus." },
      { status: 422 }
    );
  }

  // ------ 8. Ecriture disque ------
  // Si re-upload : supprimer d'abord l'ancien fichier
  if (record.storagePath) {
    try {
      await unlink(record.storagePath);
    } catch (err) {
      // Non bloquant : on log mais on continue. Le vieux fichier restera
      // orphelin sur disque, un cron de purge le nettoiera plus tard.
      console.warn(
        `[prescriptions/upload] failed to unlink previous file ${record.storagePath}:`,
        err
      );
    }
  }

  const uuid = randomUUID();
  const storagePath = path.join(STORAGE_DIR, `${uuid}.pdf`);
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
      { error: "Erreur de sauvegarde, reessayez dans un instant." },
      { status: 500 }
    );
  }

  // ------ 9. Update DB : status + meta fichier ------
  await db.query(
    `UPDATE "PrescriptionUpload"
        SET "status"      = 'UPLOADED',
            "uploadedAt"  = NOW(),
            "fileSize"    = $2,
            "fileSha256"  = $3,
            "storagePath" = $4,
            "attempts"    = 0
      WHERE "id" = $1`,
    [record.id, fileRaw.size, fileSha256, storagePath]
  );

  // ------ 10. Compteur agregat (une seule fois par upload, pas sur re-upload) ------
  // Un re-upload ne re-incremente pas : c'est toujours la meme ordonnance,
  // meme si son contenu a change (patient corrige son scan).
  const isFirstUpload = record.status === "PENDING";
  if (isFirstUpload) {
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
      console.error("[prescriptions/upload] PrescriptionStats upsert failed:", err);
    }
  }

  // ------ 11. Audit log success ------
  await auditLog({
    uploadId: record.id,
    action: "upload",
    actorIp,
    actorUserAgent,
    success: true,
    errorReason: isFirstUpload ? null : "re-upload",
  });

  return NextResponse.json(
    {
      status: "UPLOADED",
      message: isFirstUpload
        ? "Votre ordonnance a bien ete deposee. Elle sera transmise au centre."
        : "Votre ordonnance a bien ete mise a jour.",
    },
    { status: 200 }
  );
}

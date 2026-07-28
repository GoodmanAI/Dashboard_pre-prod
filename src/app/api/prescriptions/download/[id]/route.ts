import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * GET /api/prescriptions/download/[id]
 *
 * Recupere le PDF ordonnance depuis le disque et le sert a AI2Xplore.
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Chemin sous /download/[id] et non /[id]/download pour eviter le conflit
 * de slug names Next.js avec /[token]/upload (patient). [token] et [id]
 * ne peuvent pas coexister au meme niveau dynamique.
 *
 * Autorise sur les statuts UPLOADED et ACKED (permet re-download apres
 * ack, ex. si la copie locale AI2Xplore a ete perdue).
 * Refuse sur PENDING (rien a telecharger), EXPIRED, LOCKED.
 *
 * Reponse 200 : le PDF brut, avec headers :
 *   Content-Type: application/pdf
 *   Content-Length: taille exacte
 *   Content-Disposition: attachment; filename="prescription-{id}.pdf"
 *   X-File-Sha256: hex SHA256 pour verification integrite cote client
 *
 * Chaque download est loggue dans PrescriptionAccessLog (RGPD : trace
 * qui/quand a accede au PDF patient).
 */

function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

async function auditLog(params: {
  uploadId: number | null;
  actorIp: string | null;
  success: boolean;
  errorReason?: string | null;
}): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "actorIp", "success", "errorReason")
      VALUES ($1, 'download', 'bot', $2::inet, $3, $4)
      `,
      [params.uploadId, params.actorIp, params.success, params.errorReason ?? null]
    );
  } catch (err) {
    console.error("[prescriptions/download] audit log failed:", err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const actorIp = extractClientIp(req);
  const uploadId = parseInt(params.id, 10);
  if (!Number.isFinite(uploadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const sel = await db.query<{
    id: number;
    status: string;
    storagePath: string | null;
    fileSize: number | null;
    fileSha256: string | null;
  }>(
    `SELECT "id", "status", "storagePath", "fileSize", "fileSha256"
       FROM "PrescriptionUpload"
      WHERE "id" = $1
      LIMIT 1`,
    [uploadId]
  );

  if (sel.rowCount === 0) {
    await auditLog({ uploadId: null, actorIp, success: false, errorReason: "unknown id" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const record = sel.rows[0];

  if (record.status !== "UPLOADED" && record.status !== "ACKED") {
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: `status=${record.status}, no file to serve`,
    });
    return NextResponse.json(
      { error: `No file available for status ${record.status}` },
      { status: 409 }
    );
  }

  if (!record.storagePath) {
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: "storagePath is null",
    });
    return NextResponse.json({ error: "Storage path missing" }, { status: 500 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(record.storagePath);
  } catch (err) {
    console.error("[prescriptions/download] readFile failed:", err);
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: `readFile: ${(err as Error).message}`,
    });
    return NextResponse.json({ error: "File not accessible" }, { status: 500 });
  }

  await auditLog({ uploadId: record.id, actorIp, success: true });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="prescription-${record.id}.pdf"`,
      "X-File-Sha256": record.fileSha256 ?? "",
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { mimeTypeFromStoragePath } from "@/lib/prescriptionFileType";

/**
 * GET /api/prescriptions/rejected/[id]/download
 *
 * Sert le PDF ordonnance a la secretaire pour re-depot manuel dans Xplore
 * (chantier prescriptions rejected 2026-08-04).
 *
 * Distinct de /api/prescriptions/download/[id] qui est reserve a AI2Xplore
 * (API key APPOINTMENT_API_KEY). Ici on accepte la session NextAuth avec
 * ownership check sur le centre de l'upload.
 *
 * Ne sert QUE les uploads REJECTED (les autres statuts n'ont pas de raison
 * d'etre telecharges par la secretaire — pour UPLOADED c'est AI2Xplore, pour
 * ACKED c'est deja dans Xplore, pour PENDING il n'y a rien).
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
      `INSERT INTO "PrescriptionAccessLog"
         ("uploadId", "action", "actorType", "actorIp", "success", "errorReason")
       VALUES ($1, 'download', 'session', $2::inet, $3, $4)`,
      [params.uploadId, params.actorIp, params.success, params.errorReason ?? null]
    );
  } catch (err) {
    console.error("[prescriptions/rejected/download] audit log failed:", err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

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
    externalCenterCode: string;
    userProductId: number | null;
  }>(
    `
    SELECT pu."id", pu."status", pu."storagePath",
           pu."fileSize", pu."fileSha256", pu."externalCenterCode",
           ecm."userProductId"
      FROM "PrescriptionUpload" pu
      LEFT JOIN "ExternalCenterMapping" ecm
             ON ecm."externalCenterCode" = pu."externalCenterCode"
     WHERE pu."id" = $1
     LIMIT 1
    `,
    [uploadId]
  );

  if (sel.rowCount === 0) {
    await auditLog({ uploadId: null, actorIp, success: false, errorReason: "unknown id" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const record = sel.rows[0];

  if (!record.userProductId) {
    return NextResponse.json(
      { error: "No UserProduct mapping" },
      { status: 500 }
    );
  }

  // Ownership check via le centre resolu
  const ownErr = await assertUserProductOwnership(auth.session, record.userProductId);
  if (ownErr) {
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: "ownership refused",
    });
    return ownErr;
  }

  if (record.status !== "REJECTED") {
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: `status=${record.status}, session download refused`,
    });
    return NextResponse.json(
      { error: `Session download not allowed for status ${record.status}` },
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
    console.error("[prescriptions/rejected/download] readFile failed:", err);
    await auditLog({
      uploadId: record.id,
      actorIp,
      success: false,
      errorReason: `readFile: ${(err as Error).message}`,
    });
    return NextResponse.json({ error: "File not accessible" }, { status: 500 });
  }

  await auditLog({ uploadId: record.id, actorIp, success: true });

  const mimeType = mimeTypeFromStoragePath(record.storagePath);
  const extension = path.extname(record.storagePath).replace(".", "") || "bin";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="ordonnance-rejetee-${record.id}.${extension}"`,
      "X-File-Sha256": record.fileSha256 ?? "",
      "Cache-Control": "no-store",
    },
  });
}

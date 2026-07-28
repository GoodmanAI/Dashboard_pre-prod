import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * POST /api/prescriptions/ack/[id]
 *
 * Appele par AI2Xplore une fois qu'il a recupere le PDF via /download ET
 * l'a stocke avec succes dans le logiciel metier du centre (rattache au
 * bon RDV). Marque la ligne PrescriptionUpload comme ACKED et incremente
 * le compteur agregat.
 *
 * Chemin sous /ack/[id] et non /[id]/ack pour eviter le conflit de slug
 * names Next.js avec /[token]/upload (patient).
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Body (optionnel) :
 *   {
 *     ackedAt?: ISO string,   // defaut = NOW() cote serveur
 *     rejected?: boolean,     // si true, ne marque PAS ACKED, log incident
 *     reason?: string         // raison humaine si rejected
 *   }
 *
 * Semantics :
 *   - Body vide OU rejected=false : marque ACKED, PrescriptionStats.acked++
 *   - rejected=true : log dans PrescriptionAccessLog avec errorReason, NE
 *     touche PAS au statut. Le row reste UPLOADED, visible pour
 *     investigation manuelle par la secretaire.
 *
 * Idempotence : si deja ACKED, retour 200 avec l'ackedAt existant. Pas de
 * double-comptage cote stats.
 *
 * Reponse 200 :
 *   { status: "ACKED" | "UPLOADED", ackedAt: ISO | null, alreadyAcked: boolean }
 */

function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export async function POST(
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

  // Body optionnel : on tolere absence complete pour un ack simple
  let body: any = {};
  const rawText = await req.text();
  if (rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const rejected = body?.rejected === true;
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const ackedAtParam =
    typeof body?.ackedAt === "string" ? new Date(body.ackedAt) : null;
  const ackedAt =
    ackedAtParam && !isNaN(ackedAtParam.getTime()) ? ackedAtParam : new Date();

  const sel = await db.query<{
    id: number;
    status: string;
    ackedAt: Date | null;
    externalCenterCode: string;
    examType: string | null;
  }>(
    `SELECT "id", "status", "ackedAt", "externalCenterCode", "examType"
       FROM "PrescriptionUpload"
      WHERE "id" = $1
      LIMIT 1`,
    [uploadId]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const record = sel.rows[0];

  // ---- CAS REJECTED ----
  if (rejected) {
    try {
      await db.query(
        `
        INSERT INTO "PrescriptionAccessLog"
          ("uploadId", "action", "actorType", "actorIp", "success", "errorReason")
        VALUES ($1, 'ack', 'bot', $2::inet, false, $3)
        `,
        [record.id, actorIp, reason ? `rejected: ${reason}` : "rejected (no reason)"]
      );
    } catch (err) {
      console.error("[prescriptions/ack] audit log rejection failed:", err);
    }
    return NextResponse.json(
      {
        status: record.status,
        ackedAt: record.ackedAt,
        alreadyAcked: record.ackedAt !== null,
        rejectionLogged: true,
      },
      { status: 200 }
    );
  }

  // ---- CAS ACK IDEMPOTENT (deja ACKED) ----
  if (record.status === "ACKED" || record.ackedAt !== null) {
    return NextResponse.json(
      {
        status: "ACKED",
        ackedAt: record.ackedAt,
        alreadyAcked: true,
      },
      { status: 200 }
    );
  }

  // ---- CAS ACK NOMINAL ----
  if (record.status !== "UPLOADED") {
    return NextResponse.json(
      { error: `Cannot ack a prescription in status ${record.status}` },
      { status: 409 }
    );
  }

  const upd = await db.query<{ ackedAt: Date; status: string }>(
    `UPDATE "PrescriptionUpload"
        SET "status"  = 'ACKED',
            "ackedAt" = $2
      WHERE "id" = $1
      RETURNING "status", "ackedAt"`,
    [record.id, ackedAt]
  );

  // Compteur agregat
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionStats"
        ("externalCenterCode", "examType", "day",
         "requested", "uploaded", "acked", "alerted", "updatedAt")
      VALUES (
        $1, $2,
        (NOW() AT TIME ZONE 'Europe/Paris')::date,
        0, 0, 1, 0, NOW()
      )
      ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
      DO UPDATE
        SET "acked"     = "PrescriptionStats"."acked" + 1,
            "updatedAt" = NOW()
      `,
      [record.externalCenterCode, record.examType]
    );
  } catch (err) {
    console.error("[prescriptions/ack] stats upsert failed:", err);
  }

  // Audit log succes
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "actorIp", "success")
      VALUES ($1, 'ack', 'bot', $2::inet, true)
      `,
      [record.id, actorIp]
    );
  } catch (err) {
    console.error("[prescriptions/ack] audit log failed:", err);
  }

  return NextResponse.json(
    {
      status: upd.rows[0].status,
      ackedAt: upd.rows[0].ackedAt,
      alreadyAcked: false,
    },
    { status: 200 }
  );
}

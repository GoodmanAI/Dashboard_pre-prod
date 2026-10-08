import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * POST /api/prescriptions/ack/[id]
 *
 * Appele par AI2Xplore une fois qu'il a recupere le document via /download ET
 * l'a stocke avec succes dans le logiciel metier du centre (rattache au
 * bon RDV). Marque le DOCUMENT (PrescriptionDocument) comme ACKED.
 *
 * `id` est l'id du document depuis le 08/10/2026 (un lien porte jusqu'a 5
 * documents). Le lien (PrescriptionUpload) garde son statut ; son "ackedAt"
 * prend l'heure du premier document acquitte, et PrescriptionStats.acked
 * n'est incremente qu'a ce moment-la (une fois par RDV). Un rejet compte par
 * document.
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
 *   - rejected=true : bascule le statut en REJECTED (rejectedAt, rejectReason,
 *     rejectAttempts, rejectErrorType), PrescriptionStats.rejected++, log
 *     'reject_failed'. La secretaire reprend la main depuis l'admin et
 *     telecharge le fichier via /api/prescriptions/rejected/[id]/download.
 *   - rejected=true sur un ACKED : ignore (log seulement) — l'ordonnance a
 *     deja ete traitee avec succes.
 *   - rejected=true sur un REJECTED : idempotent, met a jour le motif.
 *
 * ATTENTION — le passage en REJECTED est SANS RETOUR pour AI2Xplore :
 * /api/prescriptions/download/[id] ne sert que UPLOADED et ACKED (409 sinon), et
 * l'ack nominal plus bas refuse tout statut != UPLOADED. Un depot abandonne n'est
 * donc plus rejouable par scripts/retryPrescription.js cote AI2Xplore : le
 * rattrapage devient exclusivement manuel. Constate le 2026-08-12 sur les 11
 * ordonnances de Menton bloquees par un 500 Xplore.
 *
 * Idempotence : si deja ACKED, retour 200 avec l'ackedAt existant. Pas de
 * double-comptage cote stats.
 *
 * Reponse 200 :
 *   { status: "ACKED" | "REJECTED", ackedAt: ISO | null, alreadyAcked: boolean }
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
  const documentId = parseInt(params.id, 10);
  if (!Number.isFinite(documentId)) {
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
  // Champs optionnels (spec chantier prescriptions rejected 2026-08-04) :
  // AI2Xplore peut envoyer attempts (nb tentatives Xplore) et errorType
  // (categorie technique, ex: "xplore_500", "xplore_timeout", "file_rejected").
  // Backward-compat : absents = null.
  const rejectAttempts =
    Number.isFinite(body?.attempts) && body.attempts >= 0
      ? Number(body.attempts)
      : null;
  const rejectErrorType =
    typeof body?.errorType === "string" && body.errorType.length > 0
      ? body.errorType.slice(0, 64)
      : null;

  const ackedAtParam =
    typeof body?.ackedAt === "string" ? new Date(body.ackedAt) : null;
  const ackedAt =
    ackedAtParam && !isNaN(ackedAtParam.getTime()) ? ackedAtParam : new Date();

  const sel = await db.query<{
    id: number;
    uploadId: number;
    status: string;
    ackedAt: Date | null;
    rejectedAt: Date | null;
    lienAckedAt: Date | null;
    externalCenterCode: string;
    examType: string | null;
  }>(
    `SELECT d."id", d."uploadId", d."status", d."ackedAt", d."rejectedAt",
            pu."ackedAt" AS "lienAckedAt", pu."externalCenterCode", pu."examType"
       FROM "PrescriptionDocument" d
       JOIN "PrescriptionUpload" pu ON pu."id" = d."uploadId"
      WHERE d."id" = $1
      LIMIT 1`,
    [documentId]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const record = sel.rows[0];

  // ---- CAS REJECTED ----
  if (rejected) {
    // Idempotence : si deja REJECTED, on met a jour le reason/attempts mais
    // on n'incremente pas les stats une seconde fois. Utile si AI2Xplore
    // re-appelle le meme ack apres avoir change son message d'erreur.
    const alreadyRejected =
      record.status === "REJECTED" || record.rejectedAt !== null;

    if (alreadyRejected) {
      await db.query(
        `UPDATE "PrescriptionDocument"
            SET "rejectReason"    = COALESCE($2, "rejectReason"),
                "rejectAttempts"  = COALESCE($3, "rejectAttempts"),
                "rejectErrorType" = COALESCE($4, "rejectErrorType")
          WHERE "id" = $1`,
        [record.id, reason, rejectAttempts, rejectErrorType]
      );

      // Log l'update comme reject_failed pour tracer la re-tentative
      try {
        await db.query(
          `INSERT INTO "PrescriptionAccessLog"
             ("uploadId", "documentId", "action", "actorType", "actorIp", "success", "errorReason")
           VALUES ($1, $4, 'reject_failed', 'bot', $2::inet, false, $3)`,
          [record.uploadId, actorIp, reason ?? "rejected update", record.id]
        );
      } catch (err) {
        console.error("[prescriptions/ack] re-reject audit log failed:", err);
      }

      return NextResponse.json(
        {
          status: "REJECTED",
          ackedAt: null,
          alreadyAcked: false,
          alreadyRejected: true,
          rejectionLogged: true,
        },
        { status: 200 }
      );
    }

    // Refus sur ACKED : incoherent, on log mais on ne bascule pas en REJECTED
    // (l'ordonnance a deja ete traitee avec succes une fois, un ack rejected
    // apres coup = bug cote AI2Xplore ou remontee tardive a ignorer)
    if (record.status === "ACKED") {
      try {
        await db.query(
          `INSERT INTO "PrescriptionAccessLog"
             ("uploadId", "documentId", "action", "actorType", "actorIp", "success", "errorReason")
           VALUES ($1, $4, 'reject_failed', 'bot', $2::inet, false, $3)`,
          [
            record.uploadId,
            actorIp,
            `rejected apres ACKED: ${reason ?? "(no reason)"}`,
            record.id,
          ]
        );
      } catch (err) {
        console.error(
          "[prescriptions/ack] reject after ACKED log failed:",
          err
        );
      }
      return NextResponse.json(
        {
          status: "ACKED",
          ackedAt: record.ackedAt,
          alreadyAcked: true,
          rejectionIgnored: true,
        },
        { status: 200 }
      );
    }

    // Cas nominal : premiere reception d'un rejected → bascule status
    await db.query(
      `UPDATE "PrescriptionDocument"
          SET "status"          = 'REJECTED',
              "rejectedAt"      = NOW(),
              "rejectReason"    = $2,
              "rejectAttempts"  = $3,
              "rejectErrorType" = $4
        WHERE "id" = $1`,
      [record.id, reason, rejectAttempts, rejectErrorType]
    );

    // Compteur agregat rejected (par centre × type × jour)
    try {
      await db.query(
        `
        INSERT INTO "PrescriptionStats"
          ("externalCenterCode", "examType", "day",
           "requested", "uploaded", "acked", "alerted", "rejected", "updatedAt")
        VALUES (
          $1, $2,
          (NOW() AT TIME ZONE 'Europe/Paris')::date,
          0, 0, 0, 0, 1, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "rejected"  = "PrescriptionStats"."rejected" + 1,
              "updatedAt" = NOW()
        `,
        [record.externalCenterCode, record.examType]
      );
    } catch (err) {
      console.error("[prescriptions/ack] stats rejected upsert failed:", err);
    }

    // Audit log : reject_failed (nouvelle action)
    try {
      await db.query(
        `INSERT INTO "PrescriptionAccessLog"
           ("uploadId", "documentId", "action", "actorType", "actorIp", "success", "errorReason")
         VALUES ($1, $4, 'reject_failed', 'bot', $2::inet, false, $3)`,
        [record.uploadId, actorIp, reason ?? "rejected (no reason)", record.id]
      );
    } catch (err) {
      console.error("[prescriptions/ack] audit log rejection failed:", err);
    }

    return NextResponse.json(
      {
        status: "REJECTED",
        ackedAt: null,
        alreadyAcked: false,
        rejected: true,
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
    `UPDATE "PrescriptionDocument"
        SET "status"  = 'ACKED',
            "ackedAt" = $2
      WHERE "id" = $1
      RETURNING "status", "ackedAt"`,
    [record.id, ackedAt]
  );

  // Le lien garde l'heure du premier document acquitte (compte d'alertes
  // ouvertes, purge). Une ligne touchee = premier document du RDV.
  const lien = await db.query(
    `UPDATE "PrescriptionUpload"
        SET "ackedAt" = $2
      WHERE "id" = $1 AND "ackedAt" IS NULL`,
    [record.uploadId, ackedAt]
  );
  const premierAck = (lien.rowCount ?? 0) > 0;

  // Compteur agregat : une fois par RDV, au premier document acquitte
  try {
    if (premierAck)
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
        ("uploadId", "documentId", "action", "actorType", "actorIp", "success")
      VALUES ($1, $3, 'ack', 'bot', $2::inet, true)
      `,
      [record.uploadId, actorIp, record.id]
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

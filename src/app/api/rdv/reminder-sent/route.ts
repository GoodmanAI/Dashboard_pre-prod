import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * Appelé par AI2Xplore après l'envoi RÉEL d'un SMS de rappel (post-succès
 * Brevo). Trace l'envoi (audit) et incrémente le compteur ReminderStats.smsSent
 * pour la page stats no-show.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Body :
 *   {
 *     rdvId: string,
 *     externalCenterCode: string,
 *     examType?: "scanner" | "irm" | "mammo" | "radiographie" | "echographie",
 *     reminderNumber: integer (1, 2, ...),  // n° de la relance (SMS J-3 = 1, J-2 = 2, ...)
 *     sentAt: ISO string                    // timestamp de l'envoi Brevo
 *   }
 *
 * Idempotence obligatoire — clé UNIQUE (rdvId, reminderNumber) : un rejeu
 * d'un run AI2Xplore ne compte pas 2 fois le même SMS. Le compteur agrégat
 * n'est incrémenté QUE si l'insertion a réellement eu lieu.
 *
 * Réponse :
 *   200 { ok: true, counted: true }   // 1er envoi enregistré + compteur ++
 *   200 { ok: true, counted: false }  // rejeu, déjà enregistré, aucun impact
 */
export async function POST(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    rdvId,
    externalCenterCode,
    examType: examTypeRaw,
    reminderNumber,
    sentAt: sentAtRaw,
  } = body ?? {};

  if (
    typeof rdvId !== "string" ||
    rdvId.length === 0 ||
    typeof externalCenterCode !== "string" ||
    externalCenterCode.length === 0 ||
    !Number.isInteger(reminderNumber) ||
    reminderNumber < 1 ||
    typeof sentAtRaw !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid parameters" },
      { status: 400 }
    );
  }

  const sentAt = new Date(sentAtRaw);
  if (isNaN(sentAt.getTime())) {
    return NextResponse.json(
      { error: "Invalid sentAt (expected ISO string)" },
      { status: 400 }
    );
  }

  const ALLOWED_EXAM_TYPES = [
    "scanner",
    "irm",
    "mammo",
    "radiographie",
    "echographie",
  ];
  const examType: string | null =
    typeof examTypeRaw === "string" && ALLOWED_EXAM_TYPES.includes(examTypeRaw)
      ? examTypeRaw
      : null;

  // 1) Insert idempotent dans ReminderSent (audit trail). Le UNIQUE
  //    (rdvId, reminderNumber) fait le dedoublonnage : ON CONFLICT DO NOTHING
  //    et on inspecte rowCount pour savoir si c'etait un vrai insert ou un
  //    rejeu.
  const insertRes = await db.query(
    `
    INSERT INTO "ReminderSent"
      ("rdvId", "externalCenterCode", "examType", "reminderNumber", "sentAt")
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT ("rdvId", "reminderNumber") DO NOTHING
    `,
    [rdvId, externalCenterCode, examType, reminderNumber, sentAt]
  );

  const counted = (insertRes.rowCount ?? 0) > 0;

  // 2) Incrementer ReminderStats.smsSent UNIQUEMENT si le row a ete
  //    reellement insere (premier envoi). Un rejeu ne bouge pas le compteur.
  if (counted) {
    try {
      await db.query(
        `
        INSERT INTO "ReminderStats"
          ("externalCenterCode", "examType", "day",
           "smsSent", "confirmed", "cancelled", "updatedAt")
        VALUES (
          $1, $2,
          ($3::timestamptz AT TIME ZONE 'Europe/Paris')::date,
          1, 0, 0, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "smsSent"   = "ReminderStats"."smsSent" + 1,
              "updatedAt" = NOW()
        `,
        [externalCenterCode, examType, sentAt.toISOString()]
      );
    } catch (err) {
      // On a deja insere dans ReminderSent : ne pas retenter, mais logger.
      // Le desalignement compteur/audit est rare et corrigeable a la main.
      console.error("[rdv/reminder-sent] ReminderStats upsert failed:", err);
    }
  }

  return NextResponse.json({ ok: true, counted });
}

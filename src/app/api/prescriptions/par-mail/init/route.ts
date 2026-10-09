import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const ALLOWED_EXAM_TYPES = [
  "scanner",
  "irm",
  "mammo",
  "radiographie",
  "echographie",
];

/**
 * POST /api/prescriptions/par-mail/init
 *
 * Appele par LyraeTalk en fin d'appel quand le robot a dit au patient
 * d'envoyer son ordonnance par mail a l'adresse du centre : le type d'examen
 * est soumis au depot, mais aucun lien n'est parti (pas de mobile, ou pas de
 * SMS de confirmation au centre). Cree la carte « a verifier dans la boite
 * mail » de la page Ordonnances manquantes.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY), comme /api/prescriptions/init.
 *
 * Body :
 *   {
 *     rdvId: string,
 *     externalCenterCode: string,
 *     examType: "scanner" | "irm" | "mammo" | "radiographie" | "echographie",
 *     appointmentDate: ISO string,
 *     firstname?: string, lastname?: string, phone?: string
 *   }
 *
 * Idempotent sur (rdvId, centerId) : un second envoi met a jour la date et le
 * patient, sans ressortir une carte deja rangee.
 *
 * Reponse 200 : { id, created }
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

  const { rdvId, externalCenterCode, examType, appointmentDate } = body ?? {};
  const texte = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

  if (typeof rdvId !== "string" || !rdvId || typeof externalCenterCode !== "string" || !externalCenterCode) {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }
  if (typeof examType !== "string" || !ALLOWED_EXAM_TYPES.includes(examType)) {
    return NextResponse.json(
      { error: "Invalid or missing examType", expected: ALLOWED_EXAM_TYPES },
      { status: 400 }
    );
  }
  const appointmentDt = typeof appointmentDate === "string" ? new Date(appointmentDate) : null;
  if (!appointmentDt || isNaN(appointmentDt.getTime())) {
    return NextResponse.json(
      { error: "Invalid or missing appointmentDate (expected ISO string)" },
      { status: 400 }
    );
  }

  const centerRes = await db.query<{ id: number }>(
    `
    SELECT up."userId" AS "id"
      FROM "ExternalCenterMapping" m
      JOIN "UserProduct" up ON up."id" = m."userProductId"
     WHERE m."externalCenterCode" = $1
       AND up."removedAt" IS NULL
     LIMIT 1
    `,
    [externalCenterCode]
  );
  if (centerRes.rowCount === 0) {
    return NextResponse.json({ error: "Unknown externalCenterCode" }, { status: 404 });
  }
  const centerId = centerRes.rows[0].id;

  const res = await db.query<{ id: number; created: boolean }>(
    `
    INSERT INTO "PrescriptionParMail"
      ("rdvId", "centerId", "externalCenterCode", "examType",
       "appointmentDate", "firstname", "lastname", "phone")
    VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8)
    ON CONFLICT ("rdvId", "centerId") DO UPDATE
      SET "externalCenterCode" = EXCLUDED."externalCenterCode",
          "examType"           = EXCLUDED."examType",
          "appointmentDate"    = EXCLUDED."appointmentDate",
          "firstname"          = EXCLUDED."firstname",
          "lastname"           = EXCLUDED."lastname",
          "phone"              = EXCLUDED."phone"
    RETURNING "id", (xmax = 0) AS "created"
    `,
    [
      rdvId,
      centerId,
      externalCenterCode,
      examType,
      appointmentDt.toISOString(),
      texte(body.firstname),
      texte(body.lastname),
      texte(body.phone),
    ]
  );

  const io: any = globalThis.io;
  if (io) io.emit("prescription-alerts-updated", { externalCenterCode });

  return NextResponse.json({ id: res.rows[0].id, created: res.rows[0].created });
}

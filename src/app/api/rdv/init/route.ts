import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import {
  buildAppointmentToken,
  defaultExpiresAt,
  generateShortCode,
  parseBirthdate,
} from "@/lib/appointmentToken";

/** Nb max de retries si un shortCode nouvellement généré collisionne
 *  (extrêmement rare avec 60 bits d'entropie, mais on gère proprement). */
const SHORT_CODE_MAX_RETRIES = 5;

/**
 * Appelé par l'API métier (derrière VPN) pour créer un RDV en attente de confirmation
 * et récupérer l'URL unique à inclure dans le SMS au patient.
 *
 * Body attendu :
 *   {
 *     rdvId: string,                  // id du RDV côté logiciel métier
 *     phone: string,
 *     firstname: string,
 *     lastname: string,
 *     birthdate: "YYYY-MM-DD" | "DD/MM/YYYY",
 *     appointmentDate?: ISO string,
 *     externalCenterCode: string      // code centre côté logiciel métier (mappé sur User.externalCenterCode)
 *   }
 *
 * Idempotent sur (rdvId, centerId) : un second appel met à jour les infos
 * et renvoie la même URL si le RDV est encore PENDING.
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
    phone,
    firstname,
    lastname,
    birthdate,
    appointmentDate,
    externalCenterCode,
  } = body ?? {};

  if (
    typeof rdvId !== "string" ||
    typeof phone !== "string" ||
    typeof firstname !== "string" ||
    typeof lastname !== "string" ||
    typeof birthdate !== "string" ||
    typeof externalCenterCode !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid parameters" },
      { status: 400 }
    );
  }

  const birthdateDt = parseBirthdate(birthdate);
  if (!birthdateDt) {
    return NextResponse.json(
      { error: "Invalid birthdate format (expected YYYY-MM-DD or DD/MM/YYYY)" },
      { status: 400 }
    );
  }

  // Le mapping externalCenterCode -> UserProduct -> User.id (= centerId stocké).
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
    return NextResponse.json(
      { error: "Unknown externalCenterCode" },
      { status: 404 }
    );
  }
  const centerId = centerRes.rows[0].id;

  const token = buildAppointmentToken(rdvId, phone, centerId);
  const expiresAt = defaultExpiresAt();

  const appointmentDt =
    typeof appointmentDate === "string" ? new Date(appointmentDate) : null;
  const appointmentDtValid =
    appointmentDt && !isNaN(appointmentDt.getTime()) ? appointmentDt : null;

  // UPSERT avec retry sur collision de shortCode. Sur ON CONFLICT (rdvId,
  // centerId) on garde le shortCode existant (COALESCE) : ne pas invalider
  // l'URL déjà envoyée au patient par SMS si l'API métier réinit le RDV.
  let record: { id: number; token: string; status: string; expiresAt: Date; shortCode: string } | null = null;
  for (let attempt = 0; attempt < SHORT_CODE_MAX_RETRIES; attempt++) {
    const newShortCode = generateShortCode();
    try {
      const upsertRes = await db.query<{
        id: number;
        token: string;
        status: string;
        expiresAt: Date;
        shortCode: string;
      }>(
        `
        INSERT INTO "AppointmentConfirmation"
          ("rdvId", "centerId", "phone", "firstname", "lastname",
           "birthdate", "appointmentDate", "token", "shortCode", "expiresAt",
           "externalCenterCode")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ("rdvId", "centerId") DO UPDATE
          SET "phone"              = EXCLUDED."phone",
              "firstname"          = EXCLUDED."firstname",
              "lastname"           = EXCLUDED."lastname",
              "birthdate"          = EXCLUDED."birthdate",
              "appointmentDate"    = EXCLUDED."appointmentDate",
              "token"              = EXCLUDED."token",
              -- Ne PAS remplacer un shortCode existant : l'URL SMS déjà envoyée
              -- au patient doit rester valide même si l'API métier rappelle init.
              "shortCode"          = COALESCE("AppointmentConfirmation"."shortCode", EXCLUDED."shortCode"),
              "expiresAt"          = EXCLUDED."expiresAt",
              "externalCenterCode" = EXCLUDED."externalCenterCode"
        RETURNING "id", "token", "status", "expiresAt", "shortCode"
        `,
        [
          rdvId,
          centerId,
          phone,
          firstname,
          lastname,
          birthdateDt,
          appointmentDtValid,
          token,
          newShortCode,
          expiresAt,
          externalCenterCode,
        ]
      );
      record = upsertRes.rows[0];
      break;
    } catch (err: any) {
      // Postgres 23505 = unique_violation. Uniquement possible sur "shortCode"
      // (les autres UNIQUE sont couverts par ON CONFLICT). On retry.
      const isDuplicate = err?.code === "23505";
      if (!isDuplicate || attempt === SHORT_CODE_MAX_RETRIES - 1) throw err;
    }
  }
  if (!record) {
    return NextResponse.json(
      { error: "Failed to generate unique shortCode after retries" },
      { status: 500 }
    );
  }

  // URL du SMS : format court (rdv.neuracorp.ai) si RDV_SHORT_URL_BASE est
  // configurée ; sinon fallback sur l'ancien format long (PUBLIC_APP_URL/
  // confirm/{token}). Permet un déploiement progressif : tant que
  // RDV_SHORT_URL_BASE n'est pas set côté prod, les URLs longues continuent
  // d'être générées et le nouveau système de shortCode reste dormant.
  const shortBase = process.env.RDV_SHORT_URL_BASE?.replace(/\/$/, "");
  const fallbackBase =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = shortBase
    ? `${shortBase}/c/${record.shortCode}`
    : `${fallbackBase}/confirm/${record.token}`;

  return NextResponse.json(
    {
      id: record.id,
      token: record.token,
      shortCode: record.shortCode,
      url,
      status: record.status,
      expiresAt: record.expiresAt,
    },
    { status: 200 }
  );
}

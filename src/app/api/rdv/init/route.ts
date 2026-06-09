import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import {
  buildAppointmentToken,
  defaultExpiresAt,
  parseBirthdate,
} from "@/lib/appointmentToken";

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

  const upsertRes = await db.query<{
    id: number;
    token: string;
    status: string;
    expiresAt: Date;
  }>(
    `
    INSERT INTO "AppointmentConfirmation"
      ("rdvId", "centerId", "phone", "firstname", "lastname",
       "birthdate", "appointmentDate", "token", "expiresAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT ("rdvId", "centerId") DO UPDATE
      SET "phone"           = EXCLUDED."phone",
          "firstname"       = EXCLUDED."firstname",
          "lastname"        = EXCLUDED."lastname",
          "birthdate"       = EXCLUDED."birthdate",
          "appointmentDate" = EXCLUDED."appointmentDate",
          "token"           = EXCLUDED."token",
          "expiresAt"       = EXCLUDED."expiresAt"
    RETURNING "id", "token", "status", "expiresAt"
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
      expiresAt,
    ]
  );

  const record = upsertRes.rows[0];
  const baseUrl =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  return NextResponse.json(
    {
      id: record.id,
      token: record.token,
      url: `${baseUrl}/confirm/${record.token}`,
      status: record.status,
      expiresAt: record.expiresAt,
    },
    { status: 200 }
  );
}

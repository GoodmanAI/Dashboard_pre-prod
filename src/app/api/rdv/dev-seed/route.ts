import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildAppointmentToken,
  defaultExpiresAt,
  parseBirthdate,
} from "@/lib/appointmentToken";

/**
 * ⚠️ Endpoint réservé au développement local pour tester la page /confirm/[token]
 * sans dépendre de l'API métier. Désactivé en production.
 *
 * Usage : ouvrir `/api/rdv/dev-seed` (ou `/api/rdv/dev-seed?centerId=N`) dans le navigateur.
 */
export async function GET(req: NextRequest) {
  if (!process.env.APPOINTMENT_HMAC_SECRET) {
    return NextResponse.json(
      {
        error:
          "APPOINTMENT_HMAC_SECRET manquant dans .env — ajoute-le puis relance le serveur.",
      },
      { status: 500 }
    );
  }

  const centerIdParam = req.nextUrl.searchParams.get("centerId");
  const centerIdRequested = centerIdParam ? parseInt(centerIdParam, 10) : null;

  const centerRes = centerIdRequested
    ? await db.query<{ id: number; name: string | null; city: string | null }>(
        `SELECT "id", "name", "city" FROM "User" WHERE "id" = $1 LIMIT 1`,
        [centerIdRequested]
      )
    : await db.query<{ id: number; name: string | null; city: string | null }>(
        `SELECT "id", "name", "city"
           FROM "User"
          WHERE "role" = 'CLIENT'
          ORDER BY "id" ASC
          LIMIT 1`
      );

  if (centerRes.rowCount === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun centre (User CLIENT) trouvé. Crée un User CLIENT en base ou passe ?centerId=N.",
      },
      { status: 404 }
    );
  }
  const center = centerRes.rows[0];

  const rdvId = `dev-${Date.now()}`;
  const phone = "+33600000000";
  const firstname = "Jean";
  const lastname = "Dupont";
  const birthdateStr = "1990-01-15";
  const birthdate = parseBirthdate(birthdateStr)!;

  const token = buildAppointmentToken(rdvId, phone, center.id);
  const expiresAt = defaultExpiresAt();
  const appointmentDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const ins = await db.query<{ id: number; token: string }>(
    `
    INSERT INTO "AppointmentConfirmation"
      ("rdvId", "centerId", "phone", "firstname", "lastname",
       "birthdate", "appointmentDate", "token", "expiresAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT ("rdvId", "centerId") DO UPDATE
      SET "token" = EXCLUDED."token",
          "expiresAt" = EXCLUDED."expiresAt"
    RETURNING "id", "token"
    `,
    [
      rdvId,
      center.id,
      phone,
      firstname,
      lastname,
      birthdate,
      appointmentDate,
      token,
      expiresAt,
    ]
  );

  const record = ins.rows[0];
  const baseUrl =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  return NextResponse.json({
    note: "Endpoint de test — DEV uniquement.",
    center: { id: center.id, name: center.name, city: center.city },
    url: `${baseUrl}/confirm/${record.token}`,
    identity: { firstname, lastname, birthdate: birthdateStr },
    hint: "Ouvre `url` dans un navigateur et saisis exactement les valeurs d'`identity`.",
  });
}

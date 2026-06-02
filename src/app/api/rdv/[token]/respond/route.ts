import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { APPOINTMENT_MAX_ATTEMPTS, checkIdentity } from "@/lib/appointmentToken";

/**
 * Endpoint public appelé par la page /confirm/[token] à la soumission.
 *
 * Body : { firstname, lastname, birthdate, action: "CONFIRMED" | "CANCELLED" }
 *
 * Règles :
 *  - Lien introuvable / mauvais token → 404.
 *  - Statut non PENDING → 409 (déjà traité / expiré / verrouillé).
 *  - Expiration dépassée → statut passé à EXPIRED, 409.
 *  - Identité non vérifiée → incrémente attempts ; si attempts ≥ MAX → LOCKED.
 *  - Identité OK → status = action, respondedAt = now.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { firstname, lastname, birthdate, action } = body ?? {};
  if (
    typeof firstname !== "string" ||
    typeof lastname !== "string" ||
    typeof birthdate !== "string" ||
    (action !== "CONFIRMED" && action !== "CANCELLED")
  ) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const sel = await db.query<{
    id: number;
    status: string;
    attempts: number;
    expiresAt: Date;
    firstname: string;
    lastname: string;
    birthdate: string;
  }>(
    `SELECT "id", "status", "attempts", "expiresAt",
            "firstname", "lastname",
            TO_CHAR("birthdate", 'YYYY-MM-DD') AS "birthdate"
       FROM "AppointmentConfirmation"
      WHERE "token" = $1
      LIMIT 1`,
    [params.token]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const record = sel.rows[0];

  if (record.status !== "PENDING") {
    return NextResponse.json(
      { error: "Ce rendez-vous a déjà été traité.", status: record.status },
      { status: 409 }
    );
  }

  if (record.expiresAt < new Date()) {
    await db.query(
      `UPDATE "AppointmentConfirmation" SET "status" = 'EXPIRED' WHERE "id" = $1`,
      [record.id]
    );
    return NextResponse.json(
      { error: "Ce lien a expiré.", status: "EXPIRED" },
      { status: 409 }
    );
  }

  const identityOk = checkIdentity(
    { firstname, lastname, birthdate },
    {
      firstname: record.firstname,
      lastname: record.lastname,
      birthdate: record.birthdate,
    }
  );

  if (!identityOk) {
    const nextAttempts = record.attempts + 1;
    const locked = nextAttempts >= APPOINTMENT_MAX_ATTEMPTS;
    await db.query(
      `UPDATE "AppointmentConfirmation"
          SET "attempts" = $2,
              "status"   = $3
        WHERE "id" = $1`,
      [record.id, nextAttempts, locked ? "LOCKED" : "PENDING"]
    );
    return NextResponse.json(
      {
        error: "Les informations saisies ne correspondent pas.",
        status: locked ? "LOCKED" : "PENDING",
        attemptsLeft: locked ? 0 : APPOINTMENT_MAX_ATTEMPTS - nextAttempts,
      },
      { status: 422 }
    );
  }

  const upd = await db.query<{ status: string; respondedAt: Date }>(
    `UPDATE "AppointmentConfirmation"
        SET "status"          = $2,
            "respondedAction" = $2,
            "respondedAt"     = NOW()
      WHERE "id" = $1
      RETURNING "status", "respondedAt"`,
    [record.id, action]
  );

  return NextResponse.json(upd.rows[0]);
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Endpoint public appelé par la page /confirm/[token].
 * Renvoie uniquement les infos nécessaires à l'affichage (nom du centre,
 * date du RDV, statut). N'expose JAMAIS les infos d'identité stockées,
 * qui servent à la vérification stricte côté /respond.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const res = await db.query<{
    status: string;
    attempts: number;
    expiresAt: Date;
    appointmentDate: Date | null;
    centerName: string | null;
    centerCity: string | null;
  }>(
    `
    SELECT a."status", a."attempts", a."expiresAt", a."appointmentDate",
           u."name" AS "centerName", u."city" AS "centerCity"
      FROM "AppointmentConfirmation" a
      JOIN "User" u ON u."id" = a."centerId"
     WHERE a."token" = $1
     LIMIT 1
    `,
    [params.token]
  );

  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const row = res.rows[0];
  let effectiveStatus = row.status;
  if (row.status === "PENDING" && row.expiresAt < new Date()) {
    effectiveStatus = "EXPIRED";
  }

  return NextResponse.json({
    status: effectiveStatus,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    appointmentDate: row.appointmentDate,
    center: { name: row.centerName, city: row.centerCity },
  });
}

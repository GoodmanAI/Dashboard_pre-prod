import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const MAX_ACK = 500;

/**
 * Acquittement par l'API métier des events qu'elle a bien intégrés.
 *
 * Body : { ids: number[] }  (les `id` de AppointmentConfirmation renvoyés par pending-events)
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

  const { ids } = body ?? {};
  if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
    return NextResponse.json(
      { error: "`ids` must be an array of integers" },
      { status: 400 }
    );
  }
  if (ids.length === 0) {
    return NextResponse.json({ acked: 0 });
  }
  if (ids.length > MAX_ACK) {
    return NextResponse.json(
      { error: `Too many ids (max ${MAX_ACK})` },
      { status: 400 }
    );
  }

  const res = await db.query(
    `UPDATE "AppointmentConfirmation"
        SET "ackedAt" = NOW()
      WHERE "id" = ANY($1::int[])
        AND "ackedAt" IS NULL`,
    [ids]
  );

  return NextResponse.json({ acked: res.rowCount });
}

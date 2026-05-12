export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { recordHeartbeat } from "@/utils/heartbeatStore";

export async function POST(
  req: NextRequest,
  { params }: { params: { appName: string } }
) {
  // Secret partagé optionnel : si HEARTBEAT_SECRET est défini, on l'exige.
  // Absent => mode dev, on accepte tout (cohérent avec le brief).
  const expected = process.env.HEARTBEAT_SECRET;
  console.log("expected", expected);
  if (expected) {
    const got = req.headers.get("x-heartbeat-secret");

    if (got !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const appName = decodeURIComponent(params.appName);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { timestamp, pid, uptime } = body ?? {};
  if (
    typeof timestamp !== "string" ||
    typeof pid !== "number" ||
    typeof uptime !== "number"
  ) {
    return NextResponse.json(
      { error: "Invalid payload: expected { app, timestamp: ISO, pid: number, uptime: number }" },
      { status: 400 }
    );
  }

  const receivedAt = new Date().toISOString();
  // On utilise `appName` de l'URL comme clé canonique : c'est la valeur que le
  // dashboard utilisera pour identifier le service, peu importe ce que dit le body.
  recordHeartbeat({
    app: appName,
    lastSeen: receivedAt,
    clientTimestamp: timestamp,
    pid,
    uptime,
  });

  return NextResponse.json({ ok: true, receivedAt });
}

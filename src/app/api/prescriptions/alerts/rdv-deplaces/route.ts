import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth-helpers";
import { reporterDateRdv } from "@/lib/prescriptionAlerts";

const MAX_ITEMS = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/prescriptions/alerts/rdv-deplaces
 *
 * AI2Xplore signale les alertes ouvertes dont le RDV a ete deplace dans Xplore
 * en gardant son numero (le jour de Xplore differe du notre). La date de la
 * carte et l'expiration du lien de depot suivent. Voir `reporterDateRdv`.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Body : { items: [{ id: number, rdvId: string, date: "AAAA-MM-JJ", heure: "HH:MM" }] }
 * (500 au plus), heure locale de Xplore.
 *
 * Reponse 200 : { updated: <nombre>, ids: [...] }. Rejouable : une ligne deja a
 * la bonne date est simplement reecrite a l'identique.
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

  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }
  if (raw.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${MAX_ITEMS} items per call` },
      { status: 400 }
    );
  }
  const items = raw
    .map((i: any) => ({
      id: Number(i?.id),
      rdvId: String(i?.rdvId ?? "").trim(),
      date: String(i?.date ?? ""),
      heure: String(i?.heure ?? ""),
    }))
    .filter(
      (i: { id: number; rdvId: string; date: string; heure: string }) =>
        Number.isInteger(i.id) && i.rdvId && DATE_RE.test(i.date) && HEURE_RE.test(i.heure)
    );

  const updated = await reporterDateRdv(items);

  const io: any = globalThis.io;
  if (io) {
    const upids = new Set(updated.flatMap((r) => r.userProductIds));
    for (const userProductId of upids) {
      io.emit("prescription-alerts-updated", { userProductId });
    }
  }

  return NextResponse.json({
    updated: updated.length,
    ids: updated.map((r) => r.id),
  });
}

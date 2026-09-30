import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth-helpers";
import { resolveDeletedAppointments } from "@/lib/prescriptionAlerts";

const MAX_ITEMS = 500;

/**
 * POST /api/prescriptions/alerts/rdv-supprimes
 *
 * AI2Xplore signale les alertes dont le RDV a le statut `S` (supprime) dans
 * Xplore : RDV annule, ou deplace par le robot (editRDV recree le RDV et
 * annule l'ancien). L'alerte est classee (`alertResolvedAt`), la ligne garde
 * son statut, l'audit porte `auto:rdv_supprime`. Voir `resolveDeletedAppointments`.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Body : { items: [{ id: number, rdvId: string }] } (500 au plus)
 *
 * Reponse 200 : { resolved: <nombre>, ids: [...] }. Une ligne deja traitee,
 * acquittee, ou dont le rdvId ne concorde pas n'est pas comptee : l'appel est
 * rejouable sans effet de bord.
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
    .map((i: any) => ({ id: Number(i?.id), rdvId: String(i?.rdvId ?? "").trim() }))
    .filter((i: { id: number; rdvId: string }) => Number.isInteger(i.id) && i.rdvId);

  const resolved = await resolveDeletedAppointments(items);

  const io: any = globalThis.io;
  if (io) {
    const upids = new Set(resolved.flatMap((r) => r.userProductIds));
    for (const userProductId of upids) {
      io.emit("prescription-alerts-updated", { userProductId });
    }
  }

  return NextResponse.json({
    resolved: resolved.length,
    ids: resolved.map((r) => r.id),
  });
}

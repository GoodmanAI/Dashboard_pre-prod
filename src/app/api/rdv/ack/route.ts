import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const MAX_ACK = 500;

/**
 * Acquittement par l'API métier des events qu'elle a bien intégrés.
 *
 * Body : { ids: number[], problemes?: Array<{ id: number, resultat: string, detail?: string }> }
 *   - `ids` : les `id` de AppointmentConfirmation renvoyés par pending-events
 *   - `problemes` (28/11/2026, optionnel) : parmi ces events, ceux dont la réponse du patient
 *     n'est PAS passée dans Xplore (`sans_relance_a_venir`, `inconnu_xplore`, `refus`, `abandon`).
 *     Gardés dans "syncProbleme" / "syncProblemeAt" et rendus par GET /api/rdv/sante à la sonde
 *     de Daily Report, même quand AI2Xplore n'a plus de ligne `rdv_reminders` pour le RDV.
 *     Aucune identité patient : un code de résultat et le message d'Xplore.
 *     Un `problemes` illisible n'empêche jamais l'acquittement.
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

  const problemes = lireProblemes(body?.problemes, new Set(ids));
  let gardes = 0;
  if (problemes.length) {
    // Après l'acquittement : une colonne absente (SQL 2026_12_26 pas encore passé) ne doit
    // jamais faire relire au poller des events déjà acquittés.
    try {
      await db.query(
        `UPDATE "AppointmentConfirmation" AS a
            SET "syncProbleme" = p."texte",
                "syncProblemeAt" = NOW()
           FROM UNNEST($1::int[], $2::text[]) AS p("id", "texte")
          WHERE a."id" = p."id"`,
        [problemes.map((p) => p.id), problemes.map((p) => p.texte)]
      );
      gardes = problemes.length;
    } catch (e: any) {
      console.warn(`[rdv/ack] ${problemes.length} problème(s) non gardé(s) : ${e?.message}`);
    }
  }

  return NextResponse.json({ acked: res.rowCount, problemes: gardes });
}

/** Problèmes valides, limités aux ids acquittés dans cet appel. */
function lireProblemes(brut: unknown, ids: Set<number>): Array<{ id: number; texte: string }> {
  if (!Array.isArray(brut)) return [];
  const vus = new Map<number, string>();
  for (const p of brut) {
    if (!p || typeof p !== "object") continue;
    const { id, resultat, detail } = p as { id?: unknown; resultat?: unknown; detail?: unknown };
    if (!Number.isInteger(id) || !ids.has(id as number)) continue;
    if (typeof resultat !== "string" || !/^[a-z_]{1,40}$/.test(resultat)) continue;
    const suite = typeof detail === "string" && detail.trim() ? `: ${detail.trim()}` : "";
    vus.set(id as number, `${resultat}${suite}`.slice(0, 300));
  }
  return Array.from(vus, ([id, texte]) => ({ id, texte }));
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * Santé du chemin « réponse à la relance SMS → Xplore », pour la sonde de Daily Report
 * (`src/monitor/rdvSms.js`, VM 2184-4).
 *
 *  GET /api/rdv/sante   (x-api-key: DAILY_REPORT_API_KEY)
 *
 * Constat du 16/11/2026 (`plans/2026-11-reponses-sms-vers-xplore.md`, workspace) : le poller
 * d'AI2Xplore n'avait plus rien appliqué dans Xplore depuis l'été, le Dashboard comptait les
 * annulations, personne ne l'a vu. Cette route dit, sans rien écrire :
 *   - `attente` : par centre, les réponses CONFIRMED / CANCELLED non acquittées depuis plus de
 *     `ATTENTE_MIN` minutes pour un RDV à venir (le poller passe toutes les 2 min) ;
 *   - `refus` : les réponses qu'AI2Xplore n'a pas pu appliquer dans Xplore ces dernières 24 h
 *     (`rdv_reminders.xplore_sync_error`, table d'AI2Xplore dans cette base), et depuis le
 *     28/11/2026 celles qu'il a remontées dans l'acquittement (`AppointmentConfirmation.syncProbleme`),
 *     qui couvrent aussi un RDV dont la relance a été purgée. Un RDV n'y figure qu'une fois ;
 *     `erreur` commence par le cas (`refus:`, `abandon:`, `inconnu_xplore:`, `sans_relance_a_venir:`),
 *     forme inchangée pour la sonde ;
 *   - `dernierAcquittement`, `reponses24h` : de quoi lire le mail d'alerte.
 *
 * Lecture seule, et surtout PAS le `UPDATE … EXPIRED` de `pending-events`. Aucun nom, aucun
 * numéro : identifiants de RDV et codes de centre seulement.
 */

const ATTENTE_MIN = 10;

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "DAILY_REPORT_API_KEY");
  if (keyErr) return keyErr;

  const attenteRes = await db.query<{
    centre: string | null;
    nombre: string;
    plusAncienneMin: string;
  }>(
    `SELECT "externalCenterCode" AS "centre",
            COUNT(*)::text AS "nombre",
            FLOOR(EXTRACT(EPOCH FROM NOW() - MIN(COALESCE("respondedAt", "updatedAt"))) / 60)::text
              AS "plusAncienneMin"
       FROM "AppointmentConfirmation"
      WHERE "status" IN ('CONFIRMED', 'CANCELLED')
        AND "ackedAt" IS NULL
        AND COALESCE("respondedAt", "updatedAt") < NOW() - make_interval(mins => $1::int)
        AND ("appointmentDate" IS NULL OR "appointmentDate" > NOW())
      GROUP BY 1
      ORDER BY 1`,
    [ATTENTE_MIN]
  );

  const reponsesRes = await db.query<{ status: string; nombre: string }>(
    `SELECT "status", COUNT(*)::text AS "nombre"
       FROM "AppointmentConfirmation"
      WHERE "respondedAt" > NOW() - INTERVAL '24 hours'
      GROUP BY 1`
  );

  const ackRes = await db.query<{ dernier: Date | null }>(
    `SELECT MAX("ackedAt") AS "dernier" FROM "AppointmentConfirmation"`
  );

  // Table d'AI2Xplore (même base) : absente sur une base qui n'a jamais vu le poller.
  let refus: Array<{ rdvId: string; centre: string; statut: string | null; erreur: string; le: Date }> | null = null;
  try {
    const refusRes = await db.query<{
      rdvId: string;
      centre: string;
      statut: string | null;
      erreur: string;
      le: Date;
    }>(
      `SELECT "rdv_id" AS "rdvId", "code_site" AS "centre", "local_status" AS "statut",
              LEFT("xplore_sync_error", 300) AS "erreur", "xplore_sync_error_at" AS "le"
         FROM "rdv_reminders"
        WHERE "xplore_sync_error_at" > NOW() - INTERVAL '24 hours'
        ORDER BY "xplore_sync_error_at" DESC
        LIMIT 200`
    );
    refus = refusRes.rows;
  } catch (e: any) {
    console.warn(`[rdv/sante] rdv_reminders illisible : ${e?.message}`);
  }

  // Problèmes remontés par l'acquittement (SQL 2026_12_26) : colonne absente avant ce SQL.
  try {
    const remontesRes = await db.query<{
      rdvId: string;
      centre: string;
      statut: string | null;
      erreur: string;
      le: Date;
    }>(
      `SELECT "rdvId", "externalCenterCode" AS "centre", LOWER("status") AS "statut",
              LEFT("syncProbleme", 300) AS "erreur", "syncProblemeAt" AS "le"
         FROM "AppointmentConfirmation"
        WHERE "syncProblemeAt" > NOW() - INTERVAL '24 hours'
        ORDER BY "syncProblemeAt" DESC
        LIMIT 200`
    );
    const parRdv = new Map((refus ?? []).map((r) => [r.rdvId, r]));
    // Le texte remonté porte le résultat en tête (« abandon: … ») : il prime sur celui de rdv_reminders.
    for (const r of remontesRes.rows) parRdv.set(r.rdvId, r);
    refus = Array.from(parRdv.values()).sort((a, b) => +new Date(b.le) - +new Date(a.le));
  } catch (e: any) {
    console.warn(`[rdv/sante] syncProbleme illisible : ${e?.message}`);
  }

  return NextResponse.json({
    maintenant: new Date().toISOString(),
    attenteMin: ATTENTE_MIN,
    attente: attenteRes.rows.map((r) => ({
      centre: r.centre,
      nombre: Number(r.nombre),
      plusAncienneMin: Number(r.plusAncienneMin),
    })),
    refus,
    dernierAcquittement: ackRes.rows[0]?.dernier ?? null,
    reponses24h: Object.fromEntries(reponsesRes.rows.map((r) => [r.status, Number(r.nombre)])),
  });
}

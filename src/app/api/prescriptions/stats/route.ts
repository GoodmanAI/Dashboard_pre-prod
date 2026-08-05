import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";

/**
 * GET /api/prescriptions/stats?userProductId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Retourne les agregats journaliers de la table PrescriptionStats pour un
 * centre sur une periode donnee. Meme pattern que /api/rdv/stats.
 *
 * Compteurs :
 *   - requested : nb de liens ordonnance envoyes au patient (via /init)
 *   - uploaded  : nb d'ordonnances effectivement deposees par le patient
 *   - acked     : nb d'ordonnances reussies (deposees ok dans Xplore)
 *   - rejected  : nb d'ordonnances refusees par Xplore (ack rejected=true)
 *   - alerted   : nb d'alertes 48h declenchees (patient n'a rien depose)
 *
 * Bornes periode par defaut : 30 jours glissants (from = today - 30j, to = today).
 * from/to en date "YYYY-MM-DD" (Europe/Paris). Si absent, defauts appliques.
 *
 * Reponse 200 :
 *   {
 *     userProductId,
 *     from, to,
 *     totals: { requested, uploaded, acked, rejected, alerted },
 *     rates: {
 *       uploadRate,       // uploaded / requested
 *       ackRate,          // acked / uploaded
 *       rejectRate,       // rejected / uploaded
 *       alertRate,        // alerted / requested
 *     },
 *     daily: [
 *       { day: "YYYY-MM-DD", requested, uploaded, acked, rejected, alerted }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("userProductId");
  const userProductId = param ? parseInt(param, 10) : NaN;
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const to = toRaw && isYmd(toRaw) ? toRaw : null;
  const from = fromRaw && isYmd(fromRaw) ? fromRaw : null;

  // Codes centres via ExternalCenterMapping
  const codesRes = await db.query<{ externalCenterCode: string }>(
    `SELECT "externalCenterCode"
       FROM "ExternalCenterMapping"
      WHERE "userProductId" = $1`,
    [userProductId]
  );
  const codes = codesRes.rows.map((r) => r.externalCenterCode).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({
      userProductId,
      from,
      to,
      totals: { requested: 0, uploaded: 0, acked: 0, rejected: 0, alerted: 0 },
      rates: { uploadRate: 0, ackRate: 0, rejectRate: 0, alertRate: 0 },
      daily: [],
    });
  }

  // Bornes par defaut : 30 derniers jours si aucune date fournie
  // FIX 2026-08-05 : les placeholders etaient $2/$3 avec un $1=null en param
  // -> Postgres crashait car $1 n'existait pas dans le query. Reordonnee en
  // $1/$2 pour matcher les 2 params passes.
  const boundsQuery = `
    SELECT
      COALESCE($1::date, ((NOW() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '30 days')::date) AS from_date,
      COALESCE($2::date, (NOW() AT TIME ZONE 'Europe/Paris')::date) AS to_date
  `;
  const boundsRes = await db.query<{ from_date: Date; to_date: Date }>(
    boundsQuery,
    [from, to]
  );
  const fromDate = boundsRes.rows[0].from_date;
  const toDate = boundsRes.rows[0].to_date;

  // Agregat total sur la periode
  const totalsRes = await db.query<{
    requested: string;
    uploaded: string;
    acked: string;
    rejected: string;
    alerted: string;
  }>(
    `
    SELECT
      COALESCE(SUM("requested"), 0)::text AS requested,
      COALESCE(SUM("uploaded"),  0)::text AS uploaded,
      COALESCE(SUM("acked"),     0)::text AS acked,
      COALESCE(SUM("rejected"),  0)::text AS rejected,
      COALESCE(SUM("alerted"),   0)::text AS alerted
    FROM "PrescriptionStats"
    WHERE "externalCenterCode" = ANY($1::text[])
      AND "day" BETWEEN $2::date AND $3::date
    `,
    [codes, fromDate, toDate]
  );
  const t = totalsRes.rows[0];
  const requested = Number(t.requested);
  const uploaded = Number(t.uploaded);
  const acked = Number(t.acked);
  const rejected = Number(t.rejected);
  const alerted = Number(t.alerted);

  // Agregat journalier + generate_series pour combler les jours sans data
  const dailyRes = await db.query<{
    day: string;
    requested: string;
    uploaded: string;
    acked: string;
    rejected: string;
    alerted: string;
  }>(
    `
    WITH days AS (
      SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS day
    ),
    aggreg AS (
      SELECT "day"::date AS day,
             SUM("requested")::int AS requested,
             SUM("uploaded")::int  AS uploaded,
             SUM("acked")::int     AS acked,
             SUM("rejected")::int  AS rejected,
             SUM("alerted")::int   AS alerted
        FROM "PrescriptionStats"
       WHERE "externalCenterCode" = ANY($1::text[])
         AND "day" BETWEEN $2::date AND $3::date
       GROUP BY "day"
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           COALESCE(a.requested, 0)::text AS requested,
           COALESCE(a.uploaded,  0)::text AS uploaded,
           COALESCE(a.acked,     0)::text AS acked,
           COALESCE(a.rejected,  0)::text AS rejected,
           COALESCE(a.alerted,   0)::text AS alerted
      FROM days d
      LEFT JOIN aggreg a ON a.day = d.day
      ORDER BY d.day ASC
    `,
    [codes, fromDate, toDate]
  );

  const daily = dailyRes.rows.map((r) => ({
    day: r.day,
    requested: Number(r.requested),
    uploaded: Number(r.uploaded),
    acked: Number(r.acked),
    rejected: Number(r.rejected),
    alerted: Number(r.alerted),
  }));

  const rates = {
    uploadRate: requested > 0 ? Math.round((uploaded / requested) * 1000) / 10 : 0,
    ackRate: uploaded > 0 ? Math.round((acked / uploaded) * 1000) / 10 : 0,
    rejectRate: uploaded > 0 ? Math.round((rejected / uploaded) * 1000) / 10 : 0,
    alertRate: requested > 0 ? Math.round((alerted / requested) * 1000) / 10 : 0,
  };

  return NextResponse.json({
    userProductId,
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    totals: { requested, uploaded, acked, rejected, alerted },
    rates,
    daily,
  });
}

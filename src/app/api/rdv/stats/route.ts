import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuthOrApiKey } from "@/lib/auth-helpers";

/**
 * GET /api/rdv/stats
 *
 * Renvoie les compteurs de rappels no-show pour un centre donné (ou une
 * liste), sur une plage de jours civils. Alimente la page stats du
 * dashboard. Aucune donnée patient exposée, uniquement des cumuls.
 *
 * Auth mixte :
 *   - `x-api-key` (APPOINTMENT_API_KEY) → mode M2M, sélection par
 *     `externalCenterCode` (unique ou CSV). Utilisé par AI2Xplore.
 *   - Session NextAuth → mode UI, sélection par `userProductId`. Le code
 *     centre est résolu côté serveur via ExternalCenterMapping et
 *     l'ownership est vérifié.
 *
 * Query params :
 *   - `externalCenterCode` (requis en mode API key) : code centre (unique ou CSV)
 *   - `userProductId`     (requis en mode session)  : id UserProduct
 *   - `from` (optionnel)                             : "YYYY-MM-DD" (inclus) — défaut J-30
 *   - `to`   (optionnel)                             : "YYYY-MM-DD" (inclus) — défaut aujourd'hui
 *
 * Réponse :
 * {
 *   externalCenterCode: string | string[],
 *   from: "YYYY-MM-DD",
 *   to:   "YYYY-MM-DD",
 *   totals: { smsSent, confirmed, cancelled },
 *   byType: {
 *     scanner:       { smsSent, confirmed, cancelled },
 *     irm:           { ... },
 *     mammo:         { ... },
 *     radiographie:  { ... },
 *     echographie:   { ... },
 *     unknown:       { ... }         // rows sans examType
 *   },
 *   byDay: [
 *     { day: "YYYY-MM-DD", smsSent, confirmed, cancelled },
 *     ...
 *   ]
 * }
 */

const KNOWN_EXAM_TYPES = [
  "scanner",
  "irm",
  "mammo",
  "radiographie",
  "echographie",
];

type Bucket = { smsSent: number; confirmed: number; cancelled: number };

function emptyBucket(): Bucket {
  return { smsSent: 0, confirmed: 0, cancelled: 0 };
}

function parseDateOrNull(s: string | null): string | null {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formatIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "APPOINTMENT_API_KEY");
  if (auth.error) return auth.error;

  // Résolution des codes centre selon le mode d'auth.
  // - Mode API key : accepté tel quel (unique ou CSV).
  // - Mode session : userProductId → ownership check → codes centre depuis
  //   ExternalCenterMapping. On récupère TOUS les codes rattachés à ce
  //   UserProduct (un centre peut en avoir plusieurs).
  let codes: string[] = [];

  if (auth.bot) {
    const codeParam = req.nextUrl.searchParams.get("externalCenterCode");
    if (!codeParam) {
      return NextResponse.json(
        { error: "externalCenterCode is required" },
        { status: 400 }
      );
    }
    codes = Array.from(
      new Set(
        codeParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      )
    );
    if (codes.length === 0) {
      return NextResponse.json(
        { error: "externalCenterCode is required" },
        { status: 400 }
      );
    }
  } else {
    const upParam = req.nextUrl.searchParams.get("userProductId");
    const userProductId = upParam ? parseInt(upParam, 10) : NaN;
    if (!Number.isFinite(userProductId)) {
      return NextResponse.json(
        { error: "userProductId is required" },
        { status: 400 }
      );
    }
    const ownErr = await assertUserProductOwnership(auth.session, userProductId);
    if (ownErr) return ownErr;

    const mapRes = await db.query<{ externalCenterCode: string }>(
      `SELECT "externalCenterCode"
         FROM "ExternalCenterMapping"
        WHERE "userProductId" = $1`,
      [userProductId]
    );
    codes = Array.from(
      new Set(mapRes.rows.map((r) => r.externalCenterCode).filter(Boolean))
    );
    // Aucun mapping → réponse valide avec compteurs à zéro (pas une erreur :
    // un centre qui n'a jamais activé le no-show ne doit pas voir 404).
    if (codes.length === 0) {
      const to =
        parseDateOrNull(req.nextUrl.searchParams.get("to")) ?? formatIsoDay(new Date());
      let from = parseDateOrNull(req.nextUrl.searchParams.get("from"));
      if (!from) {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        from = formatIsoDay(d);
      }
      return NextResponse.json({
        externalCenterCode: [] as string[],
        from,
        to,
        totals: emptyBucket(),
        byType: {
          scanner: emptyBucket(),
          irm: emptyBucket(),
          mammo: emptyBucket(),
          radiographie: emptyBucket(),
          echographie: emptyBucket(),
          unknown: emptyBucket(),
        },
        byDay: [] as Array<{ day: string } & Bucket>,
      });
    }
  }

  const to = parseDateOrNull(req.nextUrl.searchParams.get("to")) ?? formatIsoDay(new Date());
  let from = parseDateOrNull(req.nextUrl.searchParams.get("from"));
  if (!from) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    from = formatIsoDay(d);
  }
  if (from > to) {
    return NextResponse.json(
      { error: "`from` must be <= `to`" },
      { status: 400 }
    );
  }

  // Récupère tous les rows dans la fenêtre — la table est petite (1 row par
  // centre × type × jour), pas de risque de volume ici. On ventile en Node.
  const res = await db.query<{
    examType: string | null;
    day: string;
    smsSent: number;
    confirmed: number;
    cancelled: number;
  }>(
    `
    SELECT "examType",
           TO_CHAR("day", 'YYYY-MM-DD') AS "day",
           "smsSent", "confirmed", "cancelled"
      FROM "ReminderStats"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "day" >= $2::date
       AND "day" <= $3::date
     ORDER BY "day" ASC
    `,
    [codes, from, to]
  );

  // Agrégation en 3 vues : totals, byType, byDay
  const totals = emptyBucket();
  const byType: Record<string, Bucket> = {
    scanner: emptyBucket(),
    irm: emptyBucket(),
    mammo: emptyBucket(),
    radiographie: emptyBucket(),
    echographie: emptyBucket(),
    unknown: emptyBucket(),
  };
  const byDayMap = new Map<string, Bucket>();

  for (const row of res.rows) {
    // totals
    totals.smsSent += row.smsSent;
    totals.confirmed += row.confirmed;
    totals.cancelled += row.cancelled;

    // byType — bucketise sur les 5 types connus + "unknown"
    const typeKey =
      row.examType && KNOWN_EXAM_TYPES.includes(row.examType)
        ? row.examType
        : "unknown";
    byType[typeKey].smsSent += row.smsSent;
    byType[typeKey].confirmed += row.confirmed;
    byType[typeKey].cancelled += row.cancelled;

    // byDay
    const dayBucket = byDayMap.get(row.day) ?? emptyBucket();
    dayBucket.smsSent += row.smsSent;
    dayBucket.confirmed += row.confirmed;
    dayBucket.cancelled += row.cancelled;
    byDayMap.set(row.day, dayBucket);
  }

  const byDay = Array.from(byDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, b]) => ({
      day,
      smsSent: b.smsSent,
      confirmed: b.confirmed,
      cancelled: b.cancelled,
    }));

  return NextResponse.json({
    externalCenterCode: codes.length === 1 ? codes[0] : codes,
    from,
    to,
    totals,
    byType,
    byDay,
  });
}

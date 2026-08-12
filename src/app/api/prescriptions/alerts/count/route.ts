import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import {
  DEFAULT_ALERT_AFTER_HOURS,
  normalizeAlertAfterHours,
} from "@/lib/prescriptionConfig";
import { PAST_APPOINTMENT_SQL } from "@/lib/prescriptionAlerts";

/**
 * GET /api/prescriptions/alerts/count?userProductId=X
 *
 * Endpoint leger pour le badge de la navbar : renvoie uniquement le nombre
 * d'ordonnances pending qui depassent le delai `alertAfterHours` configure
 * pour le centre (defaut 48h). Utilise par le hook usePrescriptionAlertsCount
 * qui poll toutes les 60s depuis toutes les pages du dashboard.
 *
 * Auth : session NextAuth + ownership check sur userProductId (identique a
 * /api/prescriptions/alerts).
 *
 * Filtre metier (aligne sur la page ordonnances-manquantes) :
 *   - status = 'PENDING' (le patient n'a pas encore upload)
 *   - alertResolvedAt IS NULL (secretaire n'a pas encore traite)
 *   - createdAt < NOW() - INTERVAL 'alertAfterHours hours'
 *   - appointmentDate pas anterieure au jour courant (Europe/Paris) : ces
 *     alertes sont classees automatiquement, cf. src/lib/prescriptionAlerts.ts
 *   - centre resolu via ExternalCenterMapping (multi-centre supporte)
 *
 * Reponse 200 : { userProductId, count, thresholdHours }
 *   thresholdHours = alertAfterHours du centre, utile pour afficher un tooltip
 *   "N patients depassent le delai de X heures" cote UI.
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

  // Config alertAfterHours (fallback DEFAULT si pas de ligne PrescriptionConfig)
  const cfgRes = await db.query<{ alertAfterHours: number }>(
    `SELECT "alertAfterHours"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );
  const thresholdHours =
    cfgRes.rows.length > 0
      ? normalizeAlertAfterHours(cfgRes.rows[0].alertAfterHours)
      : DEFAULT_ALERT_AFTER_HOURS;

  // Resolution userProductId -> externalCenterCodes (multi-centre)
  const codesRes = await db.query<{ externalCenterCode: string }>(
    `SELECT "externalCenterCode"
       FROM "ExternalCenterMapping"
      WHERE "userProductId" = $1`,
    [userProductId]
  );
  const codes = codesRes.rows.map((r) => r.externalCenterCode).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({ userProductId, count: 0, thresholdHours });
  }

  // Count uploads PENDING > seuil (alertes "patient n'a rien depose")
  //
  // Les RDV deja passes sont exclus : la page /alerts les classe
  // automatiquement au chargement, le badge doit annoncer le meme chiffre sans
  // attendre qu'une secretaire ouvre la page. Cet endpoint ne fait que lire —
  // il est poll toutes les 60s depuis toutes les pages, on n'y ecrit pas.
  const pendingRes = await db.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'PENDING'
       AND "alertResolvedAt" IS NULL
       AND "createdAt" < NOW() - ($2::int || ' hours')::interval
       AND NOT ${PAST_APPOINTMENT_SQL}
    `,
    [codes, thresholdHours]
  );

  // Count uploads REJECTED non resolus (alertes "Xplore a refuse, a traiter
  // manuellement", chantier prescriptions rejected 2026-08-04)
  const rejectedRes = await db.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'REJECTED'
       AND "manualResolvedAt" IS NULL
    `,
    [codes]
  );

  const pendingCount = Number(pendingRes.rows[0]?.count ?? 0);
  const rejectedCount = Number(rejectedRes.rows[0]?.count ?? 0);
  const count = pendingCount + rejectedCount;

  return NextResponse.json({
    userProductId,
    count,           // total (retrocompat : le hook usePrescriptionAlertsCount lit cette cle)
    pendingCount,    // detail pour tooltip / breakdown UI
    rejectedCount,
    thresholdHours,
  });
}

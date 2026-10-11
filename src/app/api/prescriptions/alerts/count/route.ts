import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import {
  DEFAULT_ALERT_AFTER_HOURS,
  normalizeAlertAfterHours,
} from "@/lib/prescriptionConfig";
import { PAST_APPOINTMENT_SQL } from "@/lib/prescriptionAlerts";
import {
  requirePagePermission,
  requireAnyPagePermission,
} from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

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
 * Filtre metier (aligne sur la page ordonnances-manquantes, par piece depuis
 * le 11/10/2026, plans/2026-10-documents-demandes.md) :
 *   - lien ayant une piece ni recue ni classee, creee depuis plus de
 *     'alertAfterHours hours', lien non echu
 *   - une carte par lien et par section : un lien qui attend son ordonnance
 *     ET un questionnaire compte deux fois (deux cartes, deux sections)
 *   - appointmentDate pas anterieure au jour courant (Europe/Paris) : ces
 *     alertes sont classees automatiquement, cf. src/lib/prescriptionAlerts.ts
 *   - centre resolu via ExternalCenterMapping (multi-centre supporte)
 *
 * Reponse 200 : { userProductId, count, pendingCount, documentsCount,
 *                rejectedCount, thresholdHours }
 *   thresholdHours = alertAfterHours du centre, utile pour afficher un tooltip
 *   "N patients depassent le delai de X heures" cote UI.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("userProductId");
  const userProductId = param ? parseInt(param, 10) : NaN;
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const droitErr = await requirePagePermission(PAGES.ORDONNANCES, "read");
  if (droitErr) return droitErr;

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
  const piecesRes = await db.query<{ piece: string; count: string }>(
    `
    SELECT p."piece", COUNT(DISTINCT pu."id")::text AS count
      FROM "PieceAttendue" p
      JOIN "PrescriptionUpload" pu ON pu."id" = p."uploadId"
     WHERE pu."externalCenterCode" = ANY($1::text[])
       AND pu."status" <> 'EXPIRED'
       AND p."recueAt" IS NULL
       AND p."alertResolvedAt" IS NULL
       AND p."createdAt" < NOW() - ($2::int || ' hours')::interval
       AND NOT ${PAST_APPOINTMENT_SQL}
     GROUP BY p."piece"
    `,
    [codes, thresholdHours]
  );
  const parSorte = (sorte: string) =>
    Number(piecesRes.rows.find((r) => r.piece === sorte)?.count ?? 0);

  // Count documents REJECTED non resolus (alertes "Xplore a refuse, a traiter
  // manuellement", chantier prescriptions rejected 2026-08-04). Par document
  // depuis le 08/10/2026 : un RDV peut en porter plusieurs.
  const rejectedRes = await db.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
      FROM "PrescriptionDocument" d
      JOIN "PrescriptionUpload" pu ON pu."id" = d."uploadId"
     WHERE pu."externalCenterCode" = ANY($1::text[])
       AND d."status" = 'REJECTED'
       AND d."manualResolvedAt" IS NULL
    `,
    [codes]
  );

  const pendingCount = parSorte("ordonnance");
  const documentsCount = parSorte("document");
  const rejectedCount = Number(rejectedRes.rows[0]?.count ?? 0);
  const count = pendingCount + documentsCount + rejectedCount;

  return NextResponse.json({
    userProductId,
    count, // total (retrocompat : le hook usePrescriptionAlertsCount lit cette cle)
    pendingCount, // detail pour tooltip / breakdown UI : ordonnances
    documentsCount, // questionnaires et documents
    rejectedCount,
    thresholdHours,
  });
}

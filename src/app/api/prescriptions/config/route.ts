import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAuth,
} from "@/lib/auth-helpers";
import {
  DEFAULT_PRESCRIPTION_ENABLED,
  DEFAULT_ALERT_AFTER_HOURS,
  normalizePrescriptionEnabled,
  normalizeAlertAfterHours,
  PrescriptionEnabledExamTypes,
} from "@/lib/prescriptionConfig";

/**
 * GET /api/prescriptions/config
 *
 * Deux modes, discrimines par la query string :
 *  1. ?externalCenterCode=XYZ → mode public (aucune auth requise).
 *     Utilise par LyraeTalk pour savoir, apres avoir booke un RDV, si le
 *     type d'examen configure necessite une ordonnance dans ce centre.
 *
 *  2. ?userProductId=N → mode UI (session NextAuth + ownership check).
 *
 * Reponse :
 *   {
 *     userProductId: number,
 *     enabledExamTypes: {
 *       radiographie: boolean, irm: boolean, echographie: boolean,
 *       scanner: boolean, mammo: boolean
 *     },
 *     alertAfterHours: number
 *   }
 *
 * Si aucune config n'existe encore pour ce userProductId (row absent) :
 * renvoie les defauts (tous les types desactives, alertAfterHours=48).
 */
export async function GET(req: NextRequest) {
  const externalCenterCode = req.nextUrl.searchParams.get("externalCenterCode");
  let userProductId: number | null = null;

  if (externalCenterCode) {
    const lookup = await db.query<{ id: number }>(
      `
      SELECT m."userProductId" AS "id"
        FROM "ExternalCenterMapping" m
        JOIN "UserProduct" up ON up."id" = m."userProductId"
       WHERE m."externalCenterCode" = $1
         AND up."removedAt" IS NULL
       LIMIT 1
      `,
      [externalCenterCode]
    );
    if (lookup.rowCount === 0) {
      return NextResponse.json(
        { error: "No UserProduct mapped to this externalCenterCode" },
        { status: 404 }
      );
    }
    userProductId = lookup.rows[0].id;
  } else {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const param = req.nextUrl.searchParams.get("userProductId");
    const parsed = param ? parseInt(param, 10) : NaN;
    if (!Number.isFinite(parsed)) {
      return NextResponse.json(
        { error: "Missing externalCenterCode or userProductId" },
        { status: 400 }
      );
    }
    const ownErr = await assertUserProductOwnership(auth.session, parsed);
    if (ownErr) return ownErr;
    userProductId = parsed;
  }

  const res = await db.query<{
    enabledExamTypes: unknown;
    alertAfterHours: number;
  }>(
    `SELECT "enabledExamTypes", "alertAfterHours"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );

  let enabledExamTypes: PrescriptionEnabledExamTypes = DEFAULT_PRESCRIPTION_ENABLED;
  let alertAfterHours: number = DEFAULT_ALERT_AFTER_HOURS;

  if ((res.rowCount ?? 0) > 0) {
    const row = res.rows[0];
    enabledExamTypes = normalizePrescriptionEnabled(row.enabledExamTypes);
    alertAfterHours = normalizeAlertAfterHours(row.alertAfterHours);
  }

  return NextResponse.json({
    userProductId,
    enabledExamTypes,
    alertAfterHours,
  });
}

/**
 * POST /api/prescriptions/config
 *
 * Mise a jour partielle de la config ordonnance (session UI requise, mode
 * secretaire/admin). LyraeTalk et AI2Xplore ne modifient jamais la config,
 * ils la lisent uniquement.
 *
 * Body : { userProductId: number } + au moins un des champs :
 *   - enabledExamTypes: Record<ExamTypeKey, boolean>
 *   - alertAfterHours:  number (1..720)
 *
 * Les champs absents ne sont pas modifies (merge avec l'etat courant).
 * Renvoie l'etat final normalise.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userProductId } = body ?? {};
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 }
    );
  }

  const hasEnabled = body && "enabledExamTypes" in body;
  const hasAlert = body && "alertAfterHours" in body;

  if (!hasEnabled && !hasAlert) {
    return NextResponse.json(
      { error: "Body must contain at least one field to update" },
      { status: 400 }
    );
  }

  const ownErr = await assertUserProductOwnership(
    auth.session,
    Number(userProductId)
  );
  if (ownErr) return ownErr;

  const current = await db.query<{
    enabledExamTypes: unknown;
    alertAfterHours: number | null;
  }>(
    `SELECT "enabledExamTypes", "alertAfterHours"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );
  const currentRow = (current.rowCount ?? 0) > 0 ? current.rows[0] : null;

  const nextEnabled: PrescriptionEnabledExamTypes = hasEnabled
    ? normalizePrescriptionEnabled(body.enabledExamTypes)
    : currentRow
    ? normalizePrescriptionEnabled(currentRow.enabledExamTypes)
    : { ...DEFAULT_PRESCRIPTION_ENABLED };

  const nextAlert: number = hasAlert
    ? normalizeAlertAfterHours(body.alertAfterHours)
    : currentRow
    ? normalizeAlertAfterHours(currentRow.alertAfterHours)
    : DEFAULT_ALERT_AFTER_HOURS;

  await db.query(
    `
    INSERT INTO "PrescriptionConfig"
      ("userProductId", "enabledExamTypes", "alertAfterHours", "updatedAt")
    VALUES ($1, $2::jsonb, $3, NOW())
    ON CONFLICT ("userProductId") DO UPDATE SET
      "enabledExamTypes" = EXCLUDED."enabledExamTypes",
      "alertAfterHours"  = EXCLUDED."alertAfterHours",
      "updatedAt"        = NOW()
    `,
    [userProductId, JSON.stringify(nextEnabled), nextAlert]
  );

  return NextResponse.json({
    userProductId,
    enabledExamTypes: nextEnabled,
    alertAfterHours: nextAlert,
  });
}

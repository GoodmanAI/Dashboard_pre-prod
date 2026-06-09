import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAuth,
} from "@/lib/auth-helpers";
import {
  EXAM_TYPE_KEYS,
  normalizeEnabled,
  DEFAULT_SMS_CONFIRMATION_ENABLED,
  ExamTypeKey,
} from "@/lib/smsConfirmationConfig";

/**
 * GET — récupère la config "envoi SMS de confirmation" par type d'examen.
 *
 * Deux modes, discriminés par la query string :
 *  1. `?externalCenterCode=XYZ` → mode public (aucune auth requise).
 *     Renvoie la config du UserProduct "LyraeTalk" du centre identifié.
 *     ⚠️ La donnée renvoyée n'est pas sensible (juste des booléens par type
 *     d'examen), mais quiconque connaît un externalCenterCode peut la lire.
 *
 *  2. `?userProductId=N` → mode UI (session NextAuth + ownership check).
 *
 * Réponse :
 *   {
 *     userProductId: number,
 *     enabledExamTypes: { radiographie, irm, echographie, scanner, mammo: boolean }
 *   }
 *
 * Si aucune config n'a encore été enregistrée pour ce UserProduct, renvoie
 * toutes les valeurs à `false` (opt-in explicite).
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

  const res = await db.query<{ enabledExamTypes: unknown }>(
    `SELECT "enabledExamTypes" FROM "SmsConfirmationConfig" WHERE "userProductId" = $1 LIMIT 1`,
    [userProductId]
  );

  const enabledExamTypes =
    res.rowCount === 0
      ? DEFAULT_SMS_CONFIRMATION_ENABLED
      : normalizeEnabled(res.rows[0].enabledExamTypes);

  return NextResponse.json({ userProductId, enabledExamTypes });
}

/**
 * POST — sauvegarde la config (UI dashboard uniquement, session requise).
 *
 * Body : { userProductId: number, enabledExamTypes: { radiographie, irm, ... } }
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

  const { userProductId, enabledExamTypes } = body ?? {};
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 }
    );
  }
  if (!enabledExamTypes || typeof enabledExamTypes !== "object") {
    return NextResponse.json(
      { error: "Missing enabledExamTypes object" },
      { status: 400 }
    );
  }

  const ownErr = await assertUserProductOwnership(auth.session, Number(userProductId));
  if (ownErr) return ownErr;

  const sanitized: Record<ExamTypeKey, boolean> = { ...DEFAULT_SMS_CONFIRMATION_ENABLED };
  for (const k of EXAM_TYPE_KEYS) {
    if (k in enabledExamTypes) sanitized[k] = Boolean(enabledExamTypes[k]);
  }

  await db.query(
    `
    INSERT INTO "SmsConfirmationConfig" ("userProductId", "enabledExamTypes")
    VALUES ($1, $2::jsonb)
    ON CONFLICT ("userProductId") DO UPDATE
      SET "enabledExamTypes" = EXCLUDED."enabledExamTypes"
    `,
    [userProductId, JSON.stringify(sanitized)]
  );

  return NextResponse.json({ userProductId, enabledExamTypes: sanitized });
}

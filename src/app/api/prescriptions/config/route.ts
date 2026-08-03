import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAuth,
} from "@/lib/auth-helpers";
import { rejectIfSecretary } from "@/lib/authGuards";
import {
  DEFAULT_PRESCRIPTION_ENABLED,
  DEFAULT_ALERT_AFTER_HOURS,
  normalizePrescriptionEnabled,
  normalizeAlertAfterHours,
  PrescriptionEnabledExamTypes,
} from "@/lib/prescriptionConfig";
import {
  DEFAULT_SMS_CONFIRMATION_ENABLED,
  ExamTypeKey,
  normalizeEnabled as normalizeSmsEnabled,
  SmsConfirmationEnabled,
} from "@/lib/smsConfirmationConfig";

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
  const secretaryErr = await rejectIfSecretary();
  if (secretaryErr) return secretaryErr;

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

  // ------------------------------------------------------------------------
  // Dependance metier : activer une ordonnance pour un type X implique que
  // la confirmation SMS soit egalement activee pour X (le lien de depot est
  // envoye DANS le SMS de confirmation — si le SMS n'est pas envoye, le
  // patient ne recoit pas le lien).
  //
  // Comportement :
  //   - On calcule la liste des types actives cote ordonnance
  //   - Pour chacun, on force enabledExamTypes[type] = true dans
  //     SmsConfirmationConfig (union, pas de reset des types deja actives)
  //   - Si au moins un type ordonnance actif -> sendConfirmationSms = true
  //   - Si aucun type ordonnance actif -> on ne touche PAS SmsConfirmation
  //     (le user pourrait vouloir SMS on/off independamment sans ordo)
  //
  // Rationale de la garde applicative (en plus du hint UI) : eviter qu'un
  // appel API direct ou un ancien client puisse activer une ordonnance sans
  // la SMS confirmation, ce qui casserait silencieusement le flow patient.
  // ------------------------------------------------------------------------
  const prescriptionEnabledKeys = (
    Object.entries(nextEnabled) as [ExamTypeKey, boolean][]
  )
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  let smsAutoEnabledTypes: ExamTypeKey[] = [];

  if (prescriptionEnabledKeys.length > 0) {
    const smsRes = await db.query<{ enabledExamTypes: unknown }>(
      `SELECT "enabledExamTypes"
         FROM "SmsConfirmationConfig"
        WHERE "userProductId" = $1
        LIMIT 1`,
      [userProductId]
    );

    const smsCurrentEnabled: SmsConfirmationEnabled = smsRes.rows[0]
      ? normalizeSmsEnabled(smsRes.rows[0].enabledExamTypes)
      : { ...DEFAULT_SMS_CONFIRMATION_ENABLED };

    // Union : on garde les types deja actives cote SMS + on ajoute les types
    // requis par les ordonnances. Trace des types nouvellement actives pour
    // renvoyer une info UI ("SMS auto-active pour ces types").
    const smsNextEnabled: SmsConfirmationEnabled = { ...smsCurrentEnabled };
    for (const k of prescriptionEnabledKeys) {
      if (!smsCurrentEnabled[k]) {
        smsAutoEnabledTypes.push(k);
      }
      smsNextEnabled[k] = true;
    }

    // Upsert : ne touche que enabledExamTypes + sendConfirmationSms. Les
    // autres champs (postesByType, reminderDays, cutoffHours) sont preserves
    // via la logique ON CONFLICT (le VALUES clause fournit un default seulement
    // au cas ou la ligne n'existe pas encore).
    await db.query(
      `
      INSERT INTO "SmsConfirmationConfig"
        ("userProductId", "enabledExamTypes", "postesByType", "sendConfirmationSms")
      VALUES ($1, $2::jsonb, '{}'::jsonb, true)
      ON CONFLICT ("userProductId") DO UPDATE SET
        "enabledExamTypes"    = EXCLUDED."enabledExamTypes",
        "sendConfirmationSms" = true
      `,
      [userProductId, JSON.stringify(smsNextEnabled)]
    );
  }

  // Changement de alertAfterHours = le seuil du compteur badge/page change.
  // On notifie tous les clients pour un refetch immediat (sinon ils attendent
  // le poll fallback 5 min). Emit meme si seul enabledExamTypes a change :
  // l'endpoint /count re-lit la config a chaque appel, cout negligeable.
  const io: any = globalThis.io;
  if (io) {
    io.emit("prescription-alerts-updated", { userProductId });
  }

  return NextResponse.json({
    userProductId,
    enabledExamTypes: nextEnabled,
    alertAfterHours: nextAlert,
    // Champ informatif : les types pour lesquels la confirmation SMS a ete
    // auto-activee suite au save (permet a l'UI d'afficher un message
    // explicatif dans le snackbar).
    smsAutoEnabledTypes,
  });
}

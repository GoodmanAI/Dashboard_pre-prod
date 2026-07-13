import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAuth,
} from "@/lib/auth-helpers";
import {
  EXAM_TYPE_KEYS,
  normalizeEnabled,
  normalizePostesByType,
  normalizeReminderDays,
  normalizeCutoffHours,
  normalizeSendConfirmationSms,
  DEFAULT_SMS_CONFIRMATION_ENABLED,
  DEFAULT_POSTES_BY_TYPE,
  DEFAULT_SEND_CONFIRMATION_SMS,
  SmsConfirmationEnabled,
  PostesByType,
} from "@/lib/smsConfirmationConfig";

/**
 * GET — récupère la config "SMS de confirmation / relance no-show".
 *
 * Deux modes, discriminés par la query string :
 *  1. `?externalCenterCode=XYZ` → mode public (aucune auth requise).
 *     Utilisé par le cron AI2Xplore pour connaître, par centre :
 *       - quels types d'examens sont activés,
 *       - pour chacun, les NumeroPoste Xplore à surveiller,
 *       - la cadence des relances et la fenêtre de coupure.
 *
 *  2. `?userProductId=N` → mode UI (session NextAuth + ownership check).
 *
 * Réponse :
 *   {
 *     userProductId: number,
 *     enabledExamTypes: { radiographie, irm, echographie, scanner, mammo: boolean },
 *     postesByType: Partial<Record<ExamTypeKey, string[]>>,  // uniquement types activés
 *     reminderDays: number[] | null,                          // ex: [3, 2]
 *     cutoffHours: number | null,                             // ex: 3
 *     sendConfirmationSms: boolean                            // "Confirmation de RDV par SMS" (opt-in)
 *   }
 *
 * Note : `postesByType` est filtré côté serveur pour ne renvoyer que les
 * postes des types actuellement activés. Les postes des types désactivés
 * restent stockés en DB (pas de purge) — désactiver / réactiver un type
 * ne perd pas la config des postes.
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
    postesByType: unknown;
    reminderDays: unknown;
    cutoffHours: number | null;
    sendConfirmationSms: boolean | null;
  }>(
    `SELECT "enabledExamTypes", "postesByType", "reminderDays", "cutoffHours",
            "sendConfirmationSms"
       FROM "SmsConfirmationConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );

  let enabledExamTypes: SmsConfirmationEnabled = DEFAULT_SMS_CONFIRMATION_ENABLED;
  let postesByType: PostesByType = DEFAULT_POSTES_BY_TYPE;
  let reminderDays: number[] | null = null;
  let cutoffHours: number | null = null;
  let sendConfirmationSms: boolean = DEFAULT_SEND_CONFIRMATION_SMS;

  if ((res.rowCount ?? 0) > 0) {
    const row = res.rows[0];
    enabledExamTypes = normalizeEnabled(row.enabledExamTypes);
    // Filtre côté serveur : uniquement les postes des types activés.
    const enabledKeys = EXAM_TYPE_KEYS.filter((k) => enabledExamTypes[k]);
    postesByType = normalizePostesByType(row.postesByType, enabledKeys);
    reminderDays = normalizeReminderDays(row.reminderDays);
    cutoffHours = normalizeCutoffHours(row.cutoffHours);
    sendConfirmationSms = normalizeSendConfirmationSms(row.sendConfirmationSms);
  }

  return NextResponse.json({
    userProductId,
    enabledExamTypes,
    postesByType,
    reminderDays,
    cutoffHours,
    sendConfirmationSms,
  });
}

/**
 * POST — mise à jour partielle de la config (session UI requise).
 *
 * Body : { userProductId: number } + au moins un des champs :
 *   - enabledExamTypes:    Record<ExamTypeKey, boolean>
 *   - postesByType:        Record<ExamTypeKey, string[]>
 *   - reminderDays:        number[] | null   // null = effacer, tableau = remplacer
 *   - cutoffHours:         number   | null   // null = effacer, entier = remplacer
 *   - sendConfirmationSms: boolean           // "Confirmation de RDV par SMS" (opt-in)
 *
 * Les champs absents du body ne sont pas modifiés (merge avec l'état courant).
 * Les postes des types désactivés sont **conservés en DB** — un aller-retour
 * activation/désactivation ne les perd pas ; ils sont juste masqués au GET.
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
  const hasPostes = body && "postesByType" in body;
  const hasReminderDays = body && "reminderDays" in body;
  const hasCutoffHours = body && "cutoffHours" in body;
  const hasSendConfirmationSms = body && "sendConfirmationSms" in body;

  if (
    !hasEnabled &&
    !hasPostes &&
    !hasReminderDays &&
    !hasCutoffHours &&
    !hasSendConfirmationSms
  ) {
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

  // Lit l'état courant pour merger les champs non fournis.
  const current = await db.query<{
    enabledExamTypes: unknown;
    postesByType: unknown;
    reminderDays: unknown;
    cutoffHours: number | null;
    sendConfirmationSms: boolean | null;
  }>(
    `SELECT "enabledExamTypes", "postesByType", "reminderDays", "cutoffHours",
            "sendConfirmationSms"
       FROM "SmsConfirmationConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );
  const currentRow = (current.rowCount ?? 0) > 0 ? current.rows[0] : null;

  // Merge : si le champ n'est pas dans le body, on garde ce qui est en DB.
  const nextEnabled: SmsConfirmationEnabled = hasEnabled
    ? normalizeEnabled(body.enabledExamTypes)
    : currentRow
    ? normalizeEnabled(currentRow.enabledExamTypes)
    : { ...DEFAULT_SMS_CONFIRMATION_ENABLED };

  // Pour postes, on ne restreint PAS aux types activés — on garde tout ce que
  // l'utilisateur a saisi (les types désactivés seront filtrés à la lecture).
  const nextPostes: PostesByType = hasPostes
    ? normalizePostesByType(body.postesByType)
    : currentRow
    ? normalizePostesByType(currentRow.postesByType)
    : { ...DEFAULT_POSTES_BY_TYPE };

  const nextReminderDays: number[] | null = hasReminderDays
    ? body.reminderDays === null
      ? null
      : normalizeReminderDays(body.reminderDays)
    : currentRow
    ? normalizeReminderDays(currentRow.reminderDays)
    : null;

  const nextCutoffHours: number | null = hasCutoffHours
    ? body.cutoffHours === null
      ? null
      : normalizeCutoffHours(body.cutoffHours)
    : currentRow
    ? normalizeCutoffHours(currentRow.cutoffHours)
    : null;

  const nextSendConfirmationSms: boolean = hasSendConfirmationSms
    ? normalizeSendConfirmationSms(body.sendConfirmationSms)
    : currentRow
    ? normalizeSendConfirmationSms(currentRow.sendConfirmationSms)
    : DEFAULT_SEND_CONFIRMATION_SMS;

  await db.query(
    `
    INSERT INTO "SmsConfirmationConfig"
      ("userProductId", "enabledExamTypes", "postesByType", "reminderDays",
       "cutoffHours", "sendConfirmationSms")
    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6)
    ON CONFLICT ("userProductId") DO UPDATE SET
      "enabledExamTypes"    = EXCLUDED."enabledExamTypes",
      "postesByType"        = EXCLUDED."postesByType",
      "reminderDays"        = EXCLUDED."reminderDays",
      "cutoffHours"         = EXCLUDED."cutoffHours",
      "sendConfirmationSms" = EXCLUDED."sendConfirmationSms"
    `,
    [
      userProductId,
      JSON.stringify(nextEnabled),
      JSON.stringify(nextPostes),
      nextReminderDays === null ? null : JSON.stringify(nextReminderDays),
      nextCutoffHours,
      nextSendConfirmationSms,
    ]
  );

  // Réponse : postes filtrés par types activés, pour rester cohérent avec le GET.
  const enabledKeys = EXAM_TYPE_KEYS.filter((k) => nextEnabled[k]);
  return NextResponse.json({
    userProductId,
    enabledExamTypes: nextEnabled,
    postesByType: normalizePostesByType(nextPostes, enabledKeys),
    reminderDays: nextReminderDays,
    cutoffHours: nextCutoffHours,
    sendConfirmationSms: nextSendConfirmationSms,
  });
}

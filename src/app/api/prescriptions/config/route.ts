import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAuth,
} from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import {
  DEFAULT_PRESCRIPTION_ENABLED,
  DEFAULT_ALERT_AFTER_HOURS,
  DEFAULT_ALERT_AFTER_HOURS_KONNECT,
  normalizePrescriptionEnabled,
  normalizeAlertAfterHours,
  normalizeMessagePatient,
  MESSAGE_PATIENT_MAX,
  delaiDuCanal,
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
 *     alertAfterHours: number,
 *     messagePatient: string | null,  // depuis le 21/10/2026, bas de la page de depot
 *     alertAfterHoursKonnect: number  // depuis le 26/10/2026, questionnaires des
 *                                     //  patients de Konnect (24 h par defaut)
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
    messagePatient: string | null;
    alertAfterHoursKonnect: number | null;
  }>(
    `SELECT "enabledExamTypes", "alertAfterHours", "messagePatient", "alertAfterHoursKonnect"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );

  let enabledExamTypes: PrescriptionEnabledExamTypes = DEFAULT_PRESCRIPTION_ENABLED;
  let alertAfterHours: number = DEFAULT_ALERT_AFTER_HOURS;
  let messagePatient: string | null = null;
  let alertAfterHoursKonnect: number = DEFAULT_ALERT_AFTER_HOURS_KONNECT;

  if ((res.rowCount ?? 0) > 0) {
    const row = res.rows[0];
    enabledExamTypes = normalizePrescriptionEnabled(row.enabledExamTypes);
    alertAfterHours = normalizeAlertAfterHours(row.alertAfterHours);
    messagePatient = row.messagePatient ?? null;
    alertAfterHoursKonnect = delaiDuCanal(row, "konnect");
  }

  return NextResponse.json({
    userProductId,
    enabledExamTypes,
    alertAfterHours,
    messagePatient,
    alertAfterHoursKonnect,
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
 *   - messagePatient:   string | null (500 caracteres au plus, vide = rien d'affiche)
 *   - alertAfterHoursKonnect: number (1..720), delai des questionnaires des
 *     patients de Konnect (26/10/2026). Seul dans le corps, il se regle avec le
 *     droit d'ecriture du parametrage Konnect ; sinon, celui de LyraeTalk.
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

  const hasKonnect = body && "alertAfterHoursKonnect" in body;
  const seulementKonnect =
    hasKonnect &&
    !("enabledExamTypes" in body) &&
    !("alertAfterHours" in body) &&
    !("messagePatient" in body);
  const droitEcritureErr = await requirePagePermission(
    seulementKonnect ? PAGES.KONNECT_PARAMETRAGE : PAGES.PARAMETRAGE,
    "write"
  );
  if (droitEcritureErr) return droitEcritureErr;

  const { userProductId } = body ?? {};
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 }
    );
  }

  const hasEnabled = body && "enabledExamTypes" in body;
  const hasAlert = body && "alertAfterHours" in body;
  const hasMessage = body && "messagePatient" in body;

  if (!hasEnabled && !hasAlert && !hasMessage && !hasKonnect) {
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

  let messageSaisi: string | null | undefined;
  if (hasMessage) {
    messageSaisi = normalizeMessagePatient(body.messagePatient);
    if (messageSaisi === undefined) {
      return NextResponse.json(
        { error: `Le message pour le patient dépasse ${MESSAGE_PATIENT_MAX} caractères.` },
        { status: 400 }
      );
    }
  }

  const current = await db.query<{
    enabledExamTypes: unknown;
    alertAfterHours: number | null;
    messagePatient: string | null;
    alertAfterHoursKonnect: number | null;
  }>(
    `SELECT "enabledExamTypes", "alertAfterHours", "messagePatient", "alertAfterHoursKonnect"
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

  const nextMessage: string | null = hasMessage
    ? (messageSaisi ?? null)
    : (currentRow?.messagePatient ?? null);

  // NULL garde le defaut de 24 h tant que le client n'a rien choisi.
  const nextKonnect: number | null = hasKonnect
    ? normalizeAlertAfterHours(body.alertAfterHoursKonnect)
    : (currentRow?.alertAfterHoursKonnect ?? null);

  await db.query(
    `
    INSERT INTO "PrescriptionConfig"
      ("userProductId", "enabledExamTypes", "alertAfterHours", "messagePatient",
       "alertAfterHoursKonnect", "updatedAt")
    VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
    ON CONFLICT ("userProductId") DO UPDATE SET
      "enabledExamTypes"       = EXCLUDED."enabledExamTypes",
      "alertAfterHours"        = EXCLUDED."alertAfterHours",
      "messagePatient"         = EXCLUDED."messagePatient",
      "alertAfterHoursKonnect" = EXCLUDED."alertAfterHoursKonnect",
      "updatedAt"              = NOW()
    `,
    [userProductId, JSON.stringify(nextEnabled), nextAlert, nextMessage, nextKonnect]
  );

  // Activer une ordonnance ne touche plus a SmsConfirmationConfig depuis le
  // 14/10/2026 : ni a la confirmation SMS (le robot envoie le SMS de depot seul),
  // ni aux relances no-show d'AI2Xplore (enabledExamTypes), qu'elle cochait sans
  // le dire. Plan : lyrae/plans/2026-10-confirmation-et-depot-dissocies.md.

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
    messagePatient: nextMessage,
    alertAfterHoursKonnect: delaiDuCanal({ alertAfterHoursKonnect: nextKonnect }, "konnect"),
  });
}

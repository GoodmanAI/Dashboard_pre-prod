import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import {
  buildAppointmentToken,
  generateShortCode,
  generateVerificationCode,
} from "@/lib/appointmentToken";
import { hashVerificationCode } from "@/lib/verificationCodeHash";
import {
  normalizeAlertAfterHours,
  DEFAULT_ALERT_AFTER_HOURS,
} from "@/lib/prescriptionConfig";

/** Nb max de retries si un shortCode nouvellement genere collisionne. */
const SHORT_CODE_MAX_RETRIES = 5;

/** TTL max du lien depot ordonnance en jours. Patient peut uploader jusqu'au
 *  jour du RDV, borne a 30j (au cas ou l'appointmentDate est loin ou absent). */
const PRESCRIPTION_LINK_TTL_DAYS = 30;

/** 5 types canoniques d'examen. Toute autre valeur = null (retrocompat). */
const ALLOWED_EXAM_TYPES = [
  "scanner",
  "irm",
  "mammo",
  "radiographie",
  "echographie",
];

/**
 * Calcule l'expiresAt : min(appointmentDate, createdAt + 30j).
 * Si appointmentDate absent/invalide → createdAt + 30j.
 * Si appointmentDate est dans le passe (edge case si le RDV a deja eu lieu
 * quand LyraeTalk init) → on garde createdAt + 30j pour ne pas expirer
 * immediatement, mais c'est un cas anormal a signaler.
 */
function computeExpiresAt(
  now: Date,
  appointmentDate: Date | null
): Date {
  const cap = new Date(now);
  cap.setUTCDate(cap.getUTCDate() + PRESCRIPTION_LINK_TTL_DAYS);
  if (!appointmentDate || appointmentDate.getTime() < now.getTime()) {
    return cap;
  }
  return appointmentDate.getTime() < cap.getTime() ? appointmentDate : cap;
}

/**
 * Extrait la premiere IP de x-forwarded-for (peut contenir une chaine de
 * proxys separee par des virgules). Retourne null si header absent ou vide.
 */
function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * POST /api/prescriptions/init
 *
 * Appele par LyraeTalk apres booking d'un RDV necessitant une ordonnance.
 * Reserve un slot dans PrescriptionUpload, genere shortCode + verificationCode
 * a inserer dans le SMS de confirmation patient. LyraeTalk NE stocke RIEN
 * cote lui : chaque appel /init doit renvoyer tout ce qu'il faut pour
 * composer le SMS.
 *
 * Auth : header x-api-key (APPOINTMENT_API_KEY).
 *
 * Body attendu (tout requis) :
 *   {
 *     rdvId: string,
 *     phone: string,
 *     firstname: string,
 *     lastname: string,
 *     appointmentDate: ISO string,          // requis, borne l'expiresAt
 *     externalCenterCode: string,
 *     examType: "scanner" | "irm" | "mammo" | "radiographie" | "echographie"
 *   }
 *
 * Idempotence sur (rdvId, centerId) UNIQUE :
 *   - Statut final (UPLOADED / ACKED / EXPIRED / LOCKED) : short-circuit,
 *     renvoie l'etat existant avec verificationCode: null. Le patient a
 *     deja agi (ou est bloque), pas de reemission possible.
 *   - Statut PENDING (re-init) : shortCode preserve (URL stable), nouveau
 *     code genere et hash ecrase, attempts reset a 0. Ancien code du 1er
 *     SMS ne fonctionne plus. LyraeTalk doit envoyer le nouveau SMS.
 *   - Ligne inexistante : insertion complete, shortCode + code frais.
 *
 * Reponse 200 :
 *   {
 *     id, token, shortCode,
 *     verificationCode: string | null,       // clair sauf sur statut final
 *     url: string,
 *     status: string,
 *     expiresAt: ISO,
 *     alertAfterHours: number,               // delai config avant alerte
 *                                            //  secretaire (defaut 48h),
 *                                            //  permet a LyraeTalk de
 *                                            //  personnaliser le SMS
 *                                            //  ("a deposer sous Nh")
 *     alreadyInitialized: boolean            // true = re-init d'un PENDING
 *   }
 */
export async function POST(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    rdvId,
    phone,
    firstname,
    lastname,
    appointmentDate,
    externalCenterCode,
    examType: examTypeRaw,
  } = body ?? {};

  if (
    typeof rdvId !== "string" ||
    typeof phone !== "string" ||
    typeof firstname !== "string" ||
    typeof lastname !== "string" ||
    typeof externalCenterCode !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid parameters" },
      { status: 400 }
    );
  }

  // examType est requis et doit etre canonique. Si LyraeTalk envoie un type
  // non reconnu, c'est un bug cote LyraeTalk (soit sa config prescription
  // n'est pas alignee avec le dashboard, soit un mapping s'est perdu).
  // On fail fast pour rendre le probleme visible plutot que de creer une
  // ligne "orpheline" qui ne matchera jamais aucune config.
  if (typeof examTypeRaw !== "string" || !ALLOWED_EXAM_TYPES.includes(examTypeRaw)) {
    return NextResponse.json(
      {
        error: "Invalid or missing examType",
        expected: ALLOWED_EXAM_TYPES,
      },
      { status: 400 }
    );
  }
  const examType: string = examTypeRaw;

  // appointmentDate obligatoire : sert au calcul d'expiresAt
  // (min(appointmentDate, createdAt+30j)). LyraeTalk le connait toujours au
  // moment du booking, pas de raison legitime qu'il soit absent.
  const appointmentDt =
    typeof appointmentDate === "string" ? new Date(appointmentDate) : null;
  if (!appointmentDt || isNaN(appointmentDt.getTime())) {
    return NextResponse.json(
      { error: "Invalid or missing appointmentDate (expected ISO string)" },
      { status: 400 }
    );
  }

  // Resolution externalCenterCode → centerId (User.id)
  const centerRes = await db.query<{ id: number }>(
    `
    SELECT up."userId" AS "id"
      FROM "ExternalCenterMapping" m
      JOIN "UserProduct" up ON up."id" = m."userProductId"
     WHERE m."externalCenterCode" = $1
       AND up."removedAt" IS NULL
     LIMIT 1
    `,
    [externalCenterCode]
  );
  if (centerRes.rowCount === 0) {
    return NextResponse.json(
      { error: "Unknown externalCenterCode" },
      { status: 404 }
    );
  }
  const centerId = centerRes.rows[0].id;

  // Lecture alertAfterHours du centre (via userProductId → PrescriptionConfig)
  // Renvoye dans la reponse pour que LyraeTalk puisse personnaliser le SMS
  // ("a deposer sous Nh") avec la vraie valeur configuree. Defaut 48h si
  // aucune config specifique pour ce centre.
  const alertHoursRes = await db.query<{ alertAfterHours: number | null }>(
    `
    SELECT pc."alertAfterHours"
      FROM "ExternalCenterMapping" ecm
      LEFT JOIN "PrescriptionConfig" pc ON pc."userProductId" = ecm."userProductId"
     WHERE ecm."externalCenterCode" = $1
     LIMIT 1
    `,
    [externalCenterCode]
  );
  const alertAfterHours =
    (alertHoursRes.rowCount ?? 0) > 0
      ? normalizeAlertAfterHours(alertHoursRes.rows[0].alertAfterHours)
      : DEFAULT_ALERT_AFTER_HOURS;

  // URL de base : sous-domaine dedie prefere, sinon fallback dashboard
  const shortBase = process.env.DEPOT_ORDONNANCES_URL_BASE?.replace(/\/$/, "");
  const fallbackBase =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const buildUrl = (shortCode: string) =>
    shortBase ? `${shortBase}/d/${shortCode}` : `${fallbackBase}/d/${shortCode}`;

  const actorIp = extractClientIp(req);

  // Short-circuit sur statut final
  const existingRes = await db.query<{
    id: number;
    token: string;
    shortCode: string;
    status: string;
    expiresAt: Date;
  }>(
    `SELECT "id", "token", "shortCode", "status", "expiresAt"
       FROM "PrescriptionUpload"
      WHERE "rdvId" = $1 AND "centerId" = $2
      LIMIT 1`,
    [rdvId, centerId]
  );

  if ((existingRes.rowCount ?? 0) > 0) {
    const existing = existingRes.rows[0];
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        {
          id: existing.id,
          token: existing.token,
          shortCode: existing.shortCode,
          verificationCode: null,
          url: buildUrl(existing.shortCode),
          status: existing.status,
          expiresAt: existing.expiresAt,
          alertAfterHours,
          alreadyInitialized: true,
        },
        { status: 200 }
      );
    }
    // PENDING → on continue vers l'UPSERT idempotent (COALESCE preserve shortCode + hash)
  }

  const now = new Date();
  const expiresAt = computeExpiresAt(now, appointmentDt);

  const token = buildAppointmentToken(rdvId, phone, centerId);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);

  // UPSERT avec retry sur collision shortCode.
  //
  // Semantics ON CONFLICT (rdvId, centerId) :
  //   - "shortCode" preserve via COALESCE : l'URL reste stable si LyraeTalk
  //     re-init (le patient qui a le lien du 1er SMS peut toujours l'utiliser)
  //   - "verificationCodeHash" ECRASE : chaque re-init genere un nouveau
  //     code, l'ancien code du 1er SMS ne fonctionne plus. LyraeTalk ne
  //     stocke rien cote lui, il recoit toujours un code utilisable en
  //     retour d'init.
  //   - "attempts" RESET a 0 : nouveau code = nouvelle fenetre de 3 essais
  //   - "status" RESET a 'PENDING' (par safety : on ne devrait jamais
  //     UPSERT sur un statut final grace au short-circuit plus haut, mais
  //     si un statut a change entre notre SELECT et cet INSERT on force le
  //     retour a PENDING pour rester coherent avec le nouveau code)
  //
  // xmax = 0 dans le RETURNING permet de savoir si c'est un vrai INSERT
  // (premier init, ligne cree) ou un UPDATE (re-init d'un PENDING existant).
  let record: {
    id: number;
    token: string;
    status: string;
    expiresAt: Date;
    shortCode: string;
    wasInserted: boolean;
  } | null = null;
  let attemptedShortCode: string | null = null;

  for (let attempt = 0; attempt < SHORT_CODE_MAX_RETRIES; attempt++) {
    attemptedShortCode = generateShortCode();
    try {
      const upsertRes = await db.query<{
        id: number;
        token: string;
        status: string;
        expiresAt: Date;
        shortCode: string;
        was_inserted: boolean;
      }>(
        `
        INSERT INTO "PrescriptionUpload"
          ("rdvId", "centerId", "externalCenterCode", "examType",
           "appointmentDate", "phone", "firstname", "lastname",
           "token", "shortCode", "verificationCodeHash", "expiresAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT ("rdvId", "centerId") DO UPDATE
          SET "phone"                = EXCLUDED."phone",
              "firstname"            = EXCLUDED."firstname",
              "lastname"             = EXCLUDED."lastname",
              "appointmentDate"      = EXCLUDED."appointmentDate",
              "token"                = EXCLUDED."token",
              "externalCenterCode"   = EXCLUDED."externalCenterCode",
              "examType"             = EXCLUDED."examType",
              "shortCode"            = COALESCE("PrescriptionUpload"."shortCode", EXCLUDED."shortCode"),
              "verificationCodeHash" = EXCLUDED."verificationCodeHash",
              "attempts"             = 0,
              "status"               = 'PENDING',
              "expiresAt"            = EXCLUDED."expiresAt"
        RETURNING "id", "token", "status", "expiresAt", "shortCode",
                  (xmax = 0) AS was_inserted
        `,
        [
          rdvId,
          centerId,
          externalCenterCode,
          examType,
          appointmentDt,
          phone,
          firstname,
          lastname,
          token,
          attemptedShortCode,
          verificationCodeHash,
          expiresAt,
        ]
      );
      const row = upsertRes.rows[0];
      record = {
        id: row.id,
        token: row.token,
        status: row.status,
        expiresAt: row.expiresAt,
        shortCode: row.shortCode,
        wasInserted: row.was_inserted,
      };
      break;
    } catch (err: any) {
      // Postgres 23505 = unique_violation (collision shortCode)
      const isDuplicate = err?.code === "23505";
      if (!isDuplicate || attempt === SHORT_CODE_MAX_RETRIES - 1) throw err;
    }
  }
  if (!record || !attemptedShortCode) {
    return NextResponse.json(
      { error: "Failed to generate unique shortCode after retries" },
      { status: 500 }
    );
  }

  const isFirstInit = record.wasInserted;

  // PrescriptionStats.requested++ uniquement au premier init (pas de double
  // comptage sur re-inits d'un meme RDV).
  if (isFirstInit) {
    try {
      await db.query(
        `
        INSERT INTO "PrescriptionStats"
          ("externalCenterCode", "examType", "day",
           "requested", "uploaded", "acked", "alerted", "updatedAt")
        VALUES (
          $1, $2,
          (NOW() AT TIME ZONE 'Europe/Paris')::date,
          1, 0, 0, 0, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "requested" = "PrescriptionStats"."requested" + 1,
              "updatedAt" = NOW()
        `,
        [externalCenterCode, examType]
      );
    } catch (err) {
      // On ne veut pas invalider l'init pour un compteur en echec
      console.error("[prescriptions/init] PrescriptionStats upsert failed:", err);
    }
  }

  // Audit
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "actorIp", "success")
      VALUES ($1, 'init', 'bot', $2::inet, true)
      `,
      [record.id, actorIp]
    );
  } catch (err) {
    console.error("[prescriptions/init] PrescriptionAccessLog insert failed:", err);
  }

  // On renvoie TOUJOURS le code en clair dans la reponse d'un /init reussi
  // (statut non-final). LyraeTalk ne stocke rien cote lui : chaque appel a
  // /init doit renvoyer un code utilisable pour construire le SMS.
  // alreadyInitialized reste informatif (permet a LyraeTalk de logger un
  // "on a re-init un RDV existant" si ca l'interesse cote debug).
  return NextResponse.json(
    {
      id: record.id,
      token: record.token,
      shortCode: record.shortCode,
      verificationCode,
      url: buildUrl(record.shortCode),
      status: record.status,
      expiresAt: record.expiresAt,
      alertAfterHours,
      alreadyInitialized: !isFirstInit,
    },
    { status: 200 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOneOfApiKeys } from "@/lib/auth-helpers";
import {
  buildAppointmentToken,
  generateShortCode,
  generateVerificationCode,
} from "@/lib/appointmentToken";
import { hashVerificationCode } from "@/lib/verificationCodeHash";
import { computeExpiresAt } from "@/lib/prescriptionDocuments";
import {
  normalizeAlertAfterHours,
  normalizePrescriptionEnabled,
  DEFAULT_ALERT_AFTER_HOURS,
} from "@/lib/prescriptionConfig";
import {
  ajouterPieces,
  ajouterPiecesRecues,
  documentsApplicables,
  lireDocumentsRecus,
  pieceOrdonnance,
  piecesDuLien,
  type PieceACreer,
  type PieceRenvoyee,
} from "@/lib/piecesAttendues";

/** Nb max de retries si un shortCode nouvellement genere collisionne. */
const SHORT_CODE_MAX_RETRIES = 5;

/** 5 types canoniques d'examen. Toute autre valeur = null (retrocompat). */
const ALLOWED_EXAM_TYPES = [
  "scanner",
  "irm",
  "mammo",
  "radiographie",
  "echographie",
];

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
 * Appele par LyraeTalk apres booking, et par Konnect apres reservation
 * (depuis le 11/10/2026). Reserve un slot dans PrescriptionUpload, genere
 * shortCode + verificationCode a inserer dans le message au patient.
 * L'appelant NE stocke RIEN cote lui : chaque appel /init doit renvoyer tout
 * ce qu'il faut pour composer le message.
 *
 * Auth : header x-api-key, APPOINTMENT_API_KEY (LyraeTalk) ou KONNECT_API_KEY
 * (Konnect, troisieme flux montant, DECISIONS.md du 11/10/2026).
 *
 * Body attendu :
 *   {
 *     rdvId: string,
 *     phone: string,
 *     firstname: string,
 *     lastname: string,
 *     appointmentDate: ISO string,          // requis, fixe l'expiresAt (heure du RDV)
 *     externalCenterCode: string,
 *     examType: "scanner" | "irm" | "mammo" | "radiographie" | "echographie",
 *     mineur?: boolean,                     // facultatif ; son absence = appelant
 *                                           //  d'avant les documents demandes
 *     grossessePossible?: boolean,          // depuis le 15/10/2026, LyraeTalk :
 *                                           //  12 a 55 ans, sexe F, ou sexe ou
 *                                           //  age inconnu ; absent = false
 *     ordonnanceRecue?: boolean,            // Konnect : toujours vrai, impose
 *     documentsRecus?: (number | { id: number, alertes: string[] })[]
 *                                           // Konnect seul (26/10/2026) :
 *                                           //  DocumentDemande remplis dans son
 *                                           //  parcours et deja envoyes dans
 *                                           //  Xplore. Jamais redemandes ; ceux
 *                                           //  qui portent une alerte deviennent
 *                                           //  des pieces recues (« Reponses a
 *                                           //  verifier »), un lien est cree
 *                                           //  pour eux s'il le faut
 *   }
 *
 * Avec la cle Konnect, les documents sont ceux que le client a mis a
 * disposition de Konnect (`disponibleKonnect`), pas de LyraeTalk.
 *
 * Pieces attendues (plans/2026-10-documents-demandes.md) : le Dashboard les
 * calcule seul. L'ordonnance si le type est soumis au depot
 * (PrescriptionConfig) et qu'elle n'est pas deja recue ; chaque document
 * demande mis a disposition qui vaut pour ce type (et pour les mineurs, si
 * le patient l'est ; pour une grossesse possible, si l'appelant le dit,
 * plans/2026-10-attestation-grossesse.md). Aucune piece : 200 { piecesAttendues: [], url: null },
 * aucun lien cree.
 * Compatibilite : un LyraeTalk qui n'envoie pas `mineur` n'appelle /init que
 * pour un type soumis au depot ; l'ordonnance lui est toujours demandee,
 * comme avant.
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
 *     alreadyInitialized: boolean,           // true = re-init d'un PENDING
 *     piecesAttendues: [{ piece: "ordonnance" | "document",
 *                         libelle, avecModele, recue }]
 *                                            // recue : deja la ; un lien dont
 *                                            //  toutes les pieces sont recues
 *                                            //  n'est pas a envoyer au patient
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = requireOneOfApiKeys(req, [
    "APPOINTMENT_API_KEY",
    "KONNECT_API_KEY",
  ]);
  if (auth.error) return auth.error;
  const parKonnect = auth.envVar === "KONNECT_API_KEY";

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
    mineur: mineurRaw,
    grossessePossible: grossessePossibleRaw,
    ordonnanceRecue: ordonnanceRecueRaw,
    documentsRecus: documentsRecusRaw,
  } = body ?? {};
  // Konnect : questionnaires deja remplis dans son parcours et envoyes par lui
  // dans Xplore (ids de DocumentDemande) ; on ne les redemande pas.
  const documentsRecus = parKonnect ? lireDocumentsRecus(documentsRecusRaw) : [];
  const recusAvecAlertes = documentsRecus.some((d) => d.alertes.length > 0);
  // Un appelant qui ne connait pas encore les documents demandes n'envoie
  // pas `mineur` : on garde pour lui le comportement d'avant.
  const appelantAncien =
    !parKonnect && !(body && typeof body === "object" && "mineur" in body);
  const mineur = mineurRaw === true;
  const grossessePossible = grossessePossibleRaw === true;
  const ordonnanceRecue = parKonnect || ordonnanceRecueRaw === true;

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
  if (
    typeof examTypeRaw !== "string" ||
    !ALLOWED_EXAM_TYPES.includes(examTypeRaw)
  ) {
    return NextResponse.json(
      {
        error: "Invalid or missing examType",
        expected: ALLOWED_EXAM_TYPES,
      },
      { status: 400 }
    );
  }
  const examType: string = examTypeRaw;

  // appointmentDate obligatoire : le lien vit jusqu'a l'heure du RDV
  // (computeExpiresAt). LyraeTalk le connait toujours au
  // moment du booking, pas de raison legitime qu'il soit absent.
  const appointmentDt =
    typeof appointmentDate === "string" ? new Date(appointmentDate) : null;
  if (!appointmentDt || isNaN(appointmentDt.getTime())) {
    return NextResponse.json(
      { error: "Invalid or missing appointmentDate (expected ISO string)" },
      { status: 400 }
    );
  }

  // Resolution externalCenterCode → centerId (User.id) et userProductId
  const centerRes = await db.query<{ id: number; userProductId: number }>(
    `
    SELECT up."userId" AS "id", up."id" AS "userProductId"
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
  const userProductId = centerRes.rows[0].userProductId;

  // Lecture alertAfterHours du centre (via userProductId → PrescriptionConfig)
  // Renvoye dans la reponse pour que LyraeTalk puisse personnaliser le SMS
  // ("a deposer sous Nh") avec la vraie valeur configuree. Defaut 48h si
  // aucune config specifique pour ce centre.
  const alertHoursRes = await db.query<{
    alertAfterHours: number | null;
    enabledExamTypes: unknown;
  }>(
    `
    SELECT pc."alertAfterHours", pc."enabledExamTypes"
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
  const depotActif = normalizePrescriptionEnabled(
    alertHoursRes.rows[0]?.enabledExamTypes
  );

  // Pieces a demander pour ce RDV.
  const pieces: PieceACreer[] = [];
  if (
    appelantAncien ||
    (!ordonnanceRecue &&
      depotActif[examType as keyof typeof depotActif] === true)
  ) {
    pieces.push(pieceOrdonnance());
  }
  pieces.push(
    ...(await documentsApplicables(
      userProductId,
      examType,
      mineur,
      grossessePossible,
      parKonnect ? "konnect" : "talk",
      documentsRecus.map((d) => d.id)
    ))
  );
  const enReponse = (
    liste: {
      piece: PieceRenvoyee["piece"];
      libelle: string;
      avecModele: boolean;
      recueAt: Date | null;
    }[]
  ): PieceRenvoyee[] =>
    liste.map((p) => ({
      piece: p.piece,
      libelle: p.libelle,
      avecModele: p.avecModele,
      recue: p.recueAt !== null,
    }));

  // URL de base : sous-domaine dedie prefere, sinon fallback dashboard
  const shortBase = process.env.DEPOT_ORDONNANCES_URL_BASE?.replace(/\/$/, "");
  const fallbackBase =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const buildUrl = (shortCode: string) =>
    shortBase
      ? `${shortBase}/d/${shortCode}`
      : `${fallbackBase}/d/${shortCode}`;

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

  // Un questionnaire rempli dans Konnect avec une alerte demande un lien a lui
  // seul : c'est la que la secretaire le voit.
  if ((existingRes.rowCount ?? 0) === 0 && pieces.length === 0 && !recusAvecAlertes) {
    // Rien a demander : aucun lien, l'appelant n'envoie rien.
    return NextResponse.json(
      {
        url: null,
        verificationCode: null,
        alertAfterHours,
        piecesAttendues: [],
      },
      { status: 200 }
    );
  }

  if ((existingRes.rowCount ?? 0) > 0) {
    const existing = existingRes.rows[0];
    if (existing.status !== "PENDING") {
      await ajouterPieces(existing.id, pieces);
      await ajouterPiecesRecues(existing.id, userProductId, documentsRecus);
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
          piecesAttendues: enReponse(await piecesDuLien(existing.id)),
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

  await ajouterPieces(record.id, pieces);
  await ajouterPiecesRecues(record.id, userProductId, documentsRecus);
  const piecesDuRdv = await piecesDuLien(record.id);
  // Tout est deja la (questionnaires remplis dans Konnect, avec alerte) : le
  // lien sort de PENDING comme apres un depot, sinon le cron des alertes le
  // prendrait pour une ordonnance manquante.
  if (piecesDuRdv.length > 0 && piecesDuRdv.every((p) => p.recueAt !== null)) {
    await db.query(
      `UPDATE "PrescriptionUpload"
          SET "status"     = CASE WHEN "status" = 'PENDING' THEN 'UPLOADED' ELSE "status" END,
              "uploadedAt" = COALESCE("uploadedAt", NOW())
        WHERE "id" = $1`,
      [record.id]
    );
  }

  // PrescriptionStats.requested++ uniquement au premier init (pas de double
  // comptage sur re-inits d'un meme RDV).
  // Les statistiques comptent les ordonnances : un lien qui ne demande qu'un
  // questionnaire n'y entre pas.
  if (isFirstInit && piecesDuRdv.some((p) => p.piece === "ordonnance")) {
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
      console.error(
        "[prescriptions/init] PrescriptionStats upsert failed:",
        err
      );
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
    console.error(
      "[prescriptions/init] PrescriptionAccessLog insert failed:",
      err
    );
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
      piecesAttendues: enReponse(piecesDuRdv),
    },
    { status: 200 }
  );
}

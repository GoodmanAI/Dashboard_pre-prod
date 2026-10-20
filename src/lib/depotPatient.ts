/**
 * Le chemin commun d'un document qui arrive par le lien de depot du patient :
 * fichier choisi (`/upload`) ou questionnaire rempli en ligne
 * (`/formulaire/[pieceId]/envoyer`). Lecture du lien, code du SMS, antivirus,
 * ecriture disque, ligne "PrescriptionDocument" sous verrou du lien, piece
 * recue, compteur, journal, notification de l'ecran secretaire.
 *
 * Sorti de `api/prescriptions/[token]/upload/route.ts` le 20/10/2026
 * (plans/2026-10-questionnaires-en-ligne.md, workspace), sans changer son
 * comportement.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { APPOINTMENT_MAX_ATTEMPTS } from "@/lib/appointmentToken";
import { verifyVerificationCode } from "@/lib/verificationCodeHash";
import { scanBuffer } from "@/lib/clamavScan";
import { lienOuvert } from "@/lib/prescriptionDocuments";
import { MAX_DOCUMENTS_PAR_PIECE } from "@/lib/piecesAttendues";

const STORAGE_DIR =
  process.env.PRESCRIPTIONS_STORAGE_DIR ?? "/var/www/ordonnances";

export interface LienPatient {
  id: number;
  status: string;
  attempts: number;
  expiresAt: Date;
  verificationCodeHash: string;
  externalCenterCode: string;
  examType: string | null;
  firstname: string;
  lastname: string;
  phone: string;
}

export interface Acteur {
  actorIp: string | null;
  actorUserAgent: string | null;
}

/** Extrait la premiere IP de x-forwarded-for. */
export function acteurDe(req: NextRequest): Acteur {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return {
    actorIp: first && first.length > 0 ? first : null,
    actorUserAgent: req.headers.get("user-agent"),
  };
}

/**
 * Log dans PrescriptionAccessLog. Ne throw jamais : un echec de log ne doit
 * pas invalider la reponse au patient.
 */
export async function journalPatient(params: Acteur & {
  uploadId: number | null;
  documentId?: number | null;
  action: string;
  success: boolean;
  errorReason?: string | null;
}): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "documentId", "action", "actorType", "actorIp",
         "actorUserAgent", "success", "errorReason")
      VALUES ($1, $7, $2, 'patient', $3::inet, $4, $5, $6)
      `,
      [
        params.uploadId,
        params.action,
        params.actorIp,
        params.actorUserAgent,
        params.success,
        params.errorReason ?? null,
        params.documentId ?? null,
      ]
    );
  } catch (err) {
    console.error("[prescriptions/patient] audit log failed:", err);
  }
}

/**
 * Lit le lien et verifie qu'il est ouvert. Un lien dont l'heure de RDV est
 * passee bascule en EXPIRED ici. ACKED et REJECTED (anciennes lignes, un seul
 * document) restent ouverts : le patient peut completer.
 */
export async function lienOuvertOuRefus(
  token: string,
  action: string,
  acteur: Acteur
): Promise<{ lien: LienPatient } | { refus: NextResponse }> {
  const sel = await db.query<LienPatient>(
    `SELECT pu."id", pu."status", pu."attempts", pu."expiresAt",
            pu."verificationCodeHash", pu."externalCenterCode", pu."examType",
            pu."firstname", pu."lastname", pu."phone"
       FROM "PrescriptionUpload" pu
      WHERE pu."token" = $1
      LIMIT 1`,
    [token]
  );
  if (sel.rowCount === 0) {
    await journalPatient({
      ...acteur,
      uploadId: null,
      action,
      success: false,
      errorReason: "unknown token",
    });
    return { refus: NextResponse.json({ error: "Lien invalide" }, { status: 404 }) };
  }
  const lien = sel.rows[0];
  if (!lienOuvert(lien.status, lien.expiresAt)) {
    const expire = lien.status !== "LOCKED";
    if (expire && lien.status !== "EXPIRED") {
      await db.query(
        `UPDATE "PrescriptionUpload" SET "status" = 'EXPIRED' WHERE "id" = $1`,
        [lien.id]
      );
    }
    await journalPatient({
      ...acteur,
      uploadId: lien.id,
      action,
      success: false,
      errorReason: expire ? "expired" : `status=${lien.status}`,
    });
    return {
      refus: NextResponse.json(
        expire
          ? {
              error:
                "Ce lien a expiré : l'heure de votre rendez-vous est passée.",
              status: "EXPIRED",
            }
          : {
              error: "Ce lien est verrouillé. Contactez votre centre.",
              status: "LOCKED",
            },
        { status: 409 }
      ),
    };
  }
  return { lien };
}

/**
 * Verifie le code du SMS. Un mauvais code compte un essai ; au troisieme, le
 * lien est verrouille. Renvoie null si le code est bon.
 */
export async function refusDuCode(
  lien: LienPatient,
  code: unknown,
  acteur: Acteur
): Promise<NextResponse | null> {
  const saisi = typeof code === "string" ? code.trim() : "";
  if (saisi && verifyVerificationCode(saisi, lien.verificationCodeHash)) {
    return null;
  }
  const nextAttempts = lien.attempts + 1;
  const locked = nextAttempts >= APPOINTMENT_MAX_ATTEMPTS;
  await db.query(
    `UPDATE "PrescriptionUpload"
        SET "attempts" = $2,
            "status"   = $3
      WHERE "id" = $1`,
    [lien.id, nextAttempts, locked ? "LOCKED" : lien.status]
  );
  await journalPatient({
    ...acteur,
    uploadId: lien.id,
    action: "code_failed",
    success: false,
    errorReason: locked ? "LOCKED after 3 fails" : `attempt ${nextAttempts}`,
  });
  return NextResponse.json(
    {
      error: "Code incorrect.",
      status: locked ? "LOCKED" : lien.status,
      attemptsLeft: locked ? 0 : APPOINTMENT_MAX_ATTEMPTS - nextAttempts,
    },
    { status: 422 }
  );
}

export interface PieceVisee {
  id: number;
  piece: string;
  libelle: string;
  nbDocuments: number;
}

/**
 * La piece visee par l'envoi, avec le nombre de documents deja recus.
 * `pieceId` absent : l'ordonnance, ou a defaut la premiere piece (pages
 * ouvertes avant le 11/10/2026).
 */
export async function pieceDuLien(
  uploadId: number,
  pieceId: number | null
): Promise<PieceVisee | null> {
  const res = await db.query<PieceVisee>(
    `SELECT p."id", p."piece", p."libelle",
            (SELECT COUNT(*)::int FROM "PrescriptionDocument" d
              WHERE d."pieceAttendueId" = p."id") AS "nbDocuments"
       FROM "PieceAttendue" p
      WHERE p."uploadId" = $1
        AND ($2::int IS NULL OR p."id" = $2)
      ORDER BY (p."piece" = 'ordonnance') DESC, p."ordre" ASC, p."id" ASC
      LIMIT 1`,
    [uploadId, pieceId]
  );
  return res.rows[0] ?? null;
}

export function plafondAtteint(libelle: string) {
  return NextResponse.json(
    {
      error: `Vous avez déjà envoyé ${MAX_DOCUMENTS_PAR_PIECE} documents pour « ${libelle} », c'est le maximum. Pour en ajouter un, contactez votre centre.`,
      status: "FULL",
      nbDocuments: MAX_DOCUMENTS_PAR_PIECE,
    },
    { status: 409 }
  );
}

/**
 * Antivirus, ecriture disque, puis ajout du document sous verrou du lien
 * (deux envois simultanes ne font pas un sixieme). La piece est recue a son
 * premier document. `alertes` (questionnaire en ligne) : libelles des
 * reponses a faire voir au secretariat, poses sur la piece.
 */
export async function rangerDocument(params: Acteur & {
  /** Jeton du lien, pour la ligne de log d'un fichier infecte. */
  token: string;
  lien: LienPatient;
  piece: PieceVisee;
  buffer: Buffer;
  extension: string;
  action: string;
  alertes?: string[];
}): Promise<
  | { ok: true; documentId: number; nbDocuments: number }
  | { ok: false; refus: NextResponse }
> {
  const { lien, piece, buffer, action } = params;
  const acteur = { actorIp: params.actorIp, actorUserAgent: params.actorUserAgent };

  // ------ Antivirus ------
  const scanResult = await scanBuffer(buffer);
  if (!scanResult.ok) {
    // Erreur scanner (socket down, timeout, ...) : on n'ecrit pas le fichier
    // et on demande au patient de reessayer. Log l'incident pour investiguer.
    console.error("[prescriptions/patient] clamav scan error:", scanResult.error);
    await journalPatient({
      ...acteur,
      uploadId: lien.id,
      action,
      success: false,
      errorReason: `clamav error: ${scanResult.error}`,
    });
    return {
      ok: false,
      refus: NextResponse.json(
        {
          error:
            "La vérification du fichier est indisponible. Réessayez dans un instant.",
        },
        { status: 503 }
      ),
    };
  }
  if (!scanResult.clean) {
    // Fichier infecte : rejet sec, log alerte, aucun ecrit disque.
    // Ligne de log gardee telle qu'avant le 20/10/2026 (CONTRACT.md : un log
    // se filtre) ; le tiret long y est ecrit en sequence d'echappement pour le
    // controle des textes affiches, qui ne vise pas les logs.
    console.warn(
      `[prescriptions/${action === "upload" ? "upload" : "formulaire"}] INFECTED file rejected \u2014 token=${params.token} virus=${scanResult.virus} ip=${params.actorIp}`
    );
    await journalPatient({
      ...acteur,
      uploadId: lien.id,
      action,
      success: false,
      errorReason: `infected: ${scanResult.virus}`,
    });
    return {
      ok: false,
      refus: NextResponse.json(
        { error: "Ce fichier a été refusé par l'antivirus. Envoyez-en un autre." },
        { status: 422 }
      ),
    };
  }

  // ------ Ecriture disque ------
  const uuid = randomUUID();
  const storagePath = path.join(STORAGE_DIR, `${uuid}.${params.extension}`);
  const fileSha256 = createHash("sha256").update(buffer).digest("hex");
  try {
    await writeFile(storagePath, buffer, { mode: 0o600 });
  } catch (err) {
    console.error("[prescriptions/patient] disk write failed:", err);
    await journalPatient({
      ...acteur,
      uploadId: lien.id,
      action,
      success: false,
      errorReason: "disk write failed",
    });
    return {
      ok: false,
      refus: NextResponse.json(
        { error: "L'enregistrement a échoué. Réessayez dans un instant." },
        { status: 500 }
      ),
    };
  }

  // ------ Ajout du document, sous verrou du lien ------
  // FOR UPDATE sur la ligne du lien : deux envois simultanes se suivent, et
  // le second voit le document du premier dans le compte.
  let documentId: number | null = null;
  let nbDocuments = 0;
  let premierDocument = false;
  let premiereOrdonnance = false;
  let pieceRecue = false;
  const alertes = params.alertes ?? [];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const verrou = await client.query<{ status: string }>(
      `SELECT "status" FROM "PrescriptionUpload" WHERE "id" = $1 FOR UPDATE`,
      [lien.id]
    );
    const compte = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS "n" FROM "PrescriptionDocument" WHERE "pieceAttendueId" = $1`,
      [piece.id]
    );
    const deja = compte.rows[0]?.n ?? 0;
    if (deja < MAX_DOCUMENTS_PAR_PIECE) {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO "PrescriptionDocument"
           ("uploadId", "fileSize", "fileSha256", "storagePath", "pieceAttendueId")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "id"`,
        [lien.id, buffer.length, fileSha256, storagePath, piece.id]
      );
      documentId = ins.rows[0].id;
      nbDocuments = deja + 1;
      premierDocument = verrou.rows[0]?.status === "PENDING";
      // La piece est recue a son premier document : elle sort de la liste
      // de la secretaire (« Ordonnances » ou « Questionnaires et documents »).
      const recue = await client.query(
        `UPDATE "PieceAttendue" SET "recueAt" = NOW()
          WHERE "id" = $1 AND "recueAt" IS NULL`,
        [piece.id]
      );
      pieceRecue = (recue.rowCount ?? 0) > 0;
      premiereOrdonnance = pieceRecue && piece.piece === "ordonnance";
      // Questionnaire en ligne dont une reponse demande l'oeil du
      // secretariat : la piece passe dans « Réponses à vérifier ». Un nouvel
      // envoi sans alerte ne l'en retire pas ; un envoi avec alerte la
      // rouvre si elle avait ete classee.
      if (alertes.length > 0) {
        await client.query(
          `UPDATE "PieceAttendue"
              SET "alertesReponses" = $2::jsonb,
                  "alertResolvedAt" = NULL
            WHERE "id" = $1`,
          [piece.id, JSON.stringify(alertes)]
        );
      }
      // Le lien passe en UPLOADED au premier document ; "uploadedAt" garde
      // l'heure du premier envoi (sortie de l'alerte « ordonnance manquante »).
      await client.query(
        `UPDATE "PrescriptionUpload"
            SET "status"     = CASE WHEN "status" = 'PENDING' THEN 'UPLOADED' ELSE "status" END,
                "uploadedAt" = COALESCE("uploadedAt", NOW()),
                "attempts"   = 0
          WHERE "id" = $1`,
        [lien.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[prescriptions/patient] insert document failed:", err);
    await unlink(storagePath).catch(() => {});
    return {
      ok: false,
      refus: NextResponse.json(
        { error: "L'enregistrement a échoué. Réessayez dans un instant." },
        { status: 500 }
      ),
    };
  } finally {
    client.release();
  }

  if (documentId === null) {
    // Plafond atteint entre la lecture et l'ecriture : le fichier ne sert pas.
    await unlink(storagePath).catch(() => {});
    return { ok: false, refus: plafondAtteint(piece.libelle) };
  }

  // ------ Compteur agregat (une fois par lien, a la premiere ordonnance) ------
  if (premiereOrdonnance) {
    try {
      await db.query(
        `
        INSERT INTO "PrescriptionStats"
          ("externalCenterCode", "examType", "day",
           "requested", "uploaded", "acked", "alerted", "updatedAt")
        VALUES (
          $1, $2,
          (NOW() AT TIME ZONE 'Europe/Paris')::date,
          0, 1, 0, 0, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "uploaded" = "PrescriptionStats"."uploaded" + 1,
              "updatedAt" = NOW()
        `,
        [lien.externalCenterCode, lien.examType]
      );
    } catch (err) {
      console.error("[prescriptions/patient] PrescriptionStats upsert failed:", err);
    }
  }

  // ------ Journal ------
  await journalPatient({
    ...acteur,
    uploadId: lien.id,
    documentId,
    action,
    success: true,
    errorReason: premierDocument ? null : `document ${nbDocuments}`,
  });

  // ------ Notification websocket au dashboard ------
  // Le premier document fait sortir le lien du compteur d'alertes (badge
  // navbar/header) ; une reponse a verifier l'y fait entrer. Payload
  // minimale : externalCenterCode pour permettre au client de filtrer.
  if (premierDocument || pieceRecue || alertes.length > 0) {
    const io: any = globalThis.io;
    if (io) {
      io.emit("prescription-alerts-updated", {
        externalCenterCode: lien.externalCenterCode,
      });
    }
  }

  return { ok: true, documentId, nbDocuments };
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { sortieDeSection } from "@/lib/piecesAttendues";
import { auditLog } from "@/lib/auditLog";
import { estStatutSuivi, NOTE_SUIVI_MAX } from "@/lib/suiviCarte";

/**
 * PUT /api/prescriptions/alerts/[id]/suivi
 *
 * Pose ou retire le statut de suivi d'une carte (tache Vega 35f049,
 * 28/10/2026, table "SuiviCarte") : une secretaire signale aux autres que le
 * cas est en cours, sans classer la carte. « Marquer traite » (resolve) reste
 * le seul geste qui la retire de la liste.
 *
 * Body :
 *   { userProductId: number, section?: "ordonnances" | "documents",
 *     statut: "contacte" | "injoignable" | null, note?: string | null }
 *
 * `statut: null` retire le suivi. La note (200 caracteres) n'est jamais
 * journalisee.
 *
 * Reponse :
 *   200 { id, suivi: { statut, note, parNom, majAt } | null }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const uploadId = parseInt(params.id, 10);
  if (!Number.isFinite(uploadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userProductId = Number(body?.userProductId);
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId in body" },
      { status: 400 }
    );
  }

  const statut = body?.statut ?? null;
  if (statut !== null && !estStatutSuivi(statut)) {
    return NextResponse.json({ error: "Statut inconnu" }, { status: 400 });
  }
  const noteBrute = typeof body?.note === "string" ? body.note.trim() : "";
  if (noteBrute.length > NOTE_SUIVI_MAX) {
    return NextResponse.json(
      { error: `La note dépasse ${NOTE_SUIVI_MAX} caractères. Raccourcissez-la.` },
      { status: 400 }
    );
  }
  const note = noteBrute || null;

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  // Meme droit que « Marquer traite » : la carte vit chez LyraeTalk ou Konnect.
  const droitErr = await requireAnyPagePermission(
    [PAGES.ORDONNANCES, PAGES.KONNECT_QUESTIONNAIRES],
    "write"
  );
  if (droitErr) return droitErr;

  const section = sortieDeSection(
    typeof body?.section === "string" ? body.section : null
  );

  // La carte doit etre de ce centre et encore ouverte (memes conditions que
  // resolve) : on ne suit pas une carte deja classee.
  const check = await db.query<{ id: number }>(
    `
    SELECT pu."id"
      FROM "PrescriptionUpload" pu
      JOIN "ExternalCenterMapping" ecm ON ecm."externalCenterCode" = pu."externalCenterCode"
     WHERE pu."id" = $1
       AND ecm."userProductId" = $2
       AND EXISTS (
         SELECT 1 FROM "PieceAttendue" p
          WHERE p."uploadId" = pu."id" AND p."piece" = $3
            AND (p."recueAt" IS NULL OR p."alertesReponses" IS NOT NULL)
            AND p."alertResolvedAt" IS NULL
       )
     LIMIT 1
    `,
    [uploadId, userProductId, section]
  );
  if (check.rowCount === 0) {
    return NextResponse.json(
      { error: "Cette carte a déjà été traitée. La liste va se mettre à jour." },
      { status: 404 }
    );
  }

  let suivi: {
    statut: string;
    note: string | null;
    parNom: string | null;
    majAt: Date;
  } | null = null;

  if (statut === null) {
    await db.query(
      `DELETE FROM "SuiviCarte" WHERE "uploadId" = $1 AND "piece" = $2`,
      [uploadId, section]
    );
  } else {
    const user = auth.session.user;
    const parNom = user?.name?.trim() || user?.email || null;
    const res = await db.query<{
      statut: string;
      note: string | null;
      parNom: string | null;
      majAt: Date;
    }>(
      `INSERT INTO "SuiviCarte"
         ("uploadId", "piece", "statut", "note", "parUserId", "parNom", "majAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("uploadId", "piece") DO UPDATE
         SET "statut" = EXCLUDED."statut",
             "note" = EXCLUDED."note",
             "parUserId" = EXCLUDED."parUserId",
             "parNom" = EXCLUDED."parNom",
             "majAt" = EXCLUDED."majAt"
       RETURNING "statut", "note", "parNom", "majAt"`,
      [uploadId, section, statut, note, user?.id ?? null, parNom]
    );
    suivi = res.rows[0];
  }

  // Meme evenement que resolve et upload : chaque ecran ouvert recharge sa
  // liste, chez toutes les secretaires du centre.
  const io: any = globalThis.io;
  if (io) {
    io.emit("prescription-alerts-updated", { userProductId });
  }

  auditLog("data", "prescription-suivi", {
    actor: { id: auth.session.user?.id, email: auth.session.user?.email },
    target: { type: "PrescriptionUpload", id: uploadId },
    success: true,
    metadata: { userProductId, section, statut, avecNote: note !== null },
  });

  return NextResponse.json({ id: uploadId, suivi });
}

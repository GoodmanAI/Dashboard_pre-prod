import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";

/**
 * POST /api/prescriptions/alerts/[id]/resolve
 *
 * Marque une alerte "ordonnance manquante" comme traitee par la secretaire
 * (elle a appele le patient, ou choisi d'ignorer). L'alerte disparait de la
 * liste active. La ligne PrescriptionUpload reste en base (statut inchange),
 * seul alertResolvedAt est set.
 *
 * Auth : session NextAuth + ownership check (via userProductId body).
 *
 * Body :
 *   { userProductId: number }
 *
 * Reponse :
 *   200 { id, alertResolvedAt }
 */
export async function POST(
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

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  // Verif que la ligne appartient bien au centre de l'user (via
  // externalCenterCode → mapping → userProductId) et qu'elle est encore
  // "traitable" : pas deja resolue par la secretaire, et pas deja acquittee
  // (une ligne acquittee par AI2Xplore = ordonnance recuperee, la secretaire
  // n'a plus besoin d'intervenir donc pas besoin de la marquer traitee).
  //
  // On ne verifie PAS `alertRaisedAt IS NOT NULL` : le cron d'alerte email
  // peut ne pas avoir encore tourne (pas horaire), mais la secretaire voit
  // deja la ligne dans son UI (filtre base sur createdAt < threshold, pas
  // sur alertRaisedAt) et doit pouvoir la traiter immediatement.
  const check = await db.query<{ id: number }>(
    `
    SELECT pu."id"
      FROM "PrescriptionUpload" pu
      JOIN "ExternalCenterMapping" ecm ON ecm."externalCenterCode" = pu."externalCenterCode"
     WHERE pu."id" = $1
       AND ecm."userProductId" = $2
       AND pu."alertResolvedAt" IS NULL
       AND pu."ackedAt" IS NULL
     LIMIT 1
    `,
    [uploadId, userProductId]
  );
  if (check.rowCount === 0) {
    return NextResponse.json(
      { error: "Alerte introuvable, deja traitee, ou pas dans votre centre" },
      { status: 404 }
    );
  }

  const upd = await db.query<{ alertResolvedAt: Date }>(
    `UPDATE "PrescriptionUpload"
        SET "alertResolvedAt" = NOW()
      WHERE "id" = $1
      RETURNING "alertResolvedAt"`,
    [uploadId]
  );

  // Diffusion websocket : notifie tous les clients connectes (autres pages
  // du dashboard, autres sessions secretaire du meme centre) pour rafraichir
  // instantanement le badge navbar/header sans attendre le prochain poll.
  const io: any = globalThis.io;
  if (io) {
    io.emit("prescription-alerts-updated", { userProductId });
  }

  // Audit log
  try {
    const actorId = auth.session.user?.id;
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "success", "errorReason")
      VALUES ($1, 'alert_resolved', 'session', true, $2)
      `,
      [uploadId, actorId ? `user_id=${actorId}` : null]
    );
  } catch (err) {
    console.error("[prescriptions/alerts/resolve] audit log failed:", err);
  }

  return NextResponse.json({
    id: uploadId,
    alertResolvedAt: upd.rows[0].alertResolvedAt,
  });
}

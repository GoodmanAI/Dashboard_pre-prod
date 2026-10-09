import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog } from "@/lib/auditLog";

/**
 * POST /api/prescriptions/par-mail/[id]/ranger
 *
 * Le secretariat a verifie la boite mail : la carte quitte la liste. La ligne
 * reste en base jusqu'a la purge (30 jours apres le RDV).
 *
 * Auth : session NextAuth + ownership (userProductId du body) + droit
 * d'ecriture ORDONNANCES.
 *
 * Body : { userProductId: number }
 * Reponse 200 : { id, rangeeAt }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) {
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
    return NextResponse.json({ error: "Missing or invalid userProductId in body" }, { status: 400 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const droitErr = await requirePagePermission(PAGES.ORDONNANCES, "write");
  if (droitErr) return droitErr;

  const actorId = Number(auth.session.user?.id);
  const upd = await db.query<{ rangeeAt: Date }>(
    `
    UPDATE "PrescriptionParMail" pm
       SET "rangeeAt" = NOW(), "rangeePar" = $3
      FROM "ExternalCenterMapping" ecm
     WHERE pm."id" = $1
       AND ecm."externalCenterCode" = pm."externalCenterCode"
       AND ecm."userProductId" = $2
       AND pm."rangeeAt" IS NULL
    RETURNING pm."rangeeAt"
    `,
    [id, userProductId, Number.isFinite(actorId) ? actorId : null]
  );
  if (upd.rowCount === 0) {
    return NextResponse.json(
      { error: "Cette carte est déjà rangée ou n'appartient pas à votre centre." },
      { status: 404 }
    );
  }

  const io: any = globalThis.io;
  if (io) io.emit("prescription-alerts-updated", { userProductId });

  auditLog("data", "ranger-ordonnance-par-mail", {
    actor: { id: Number.isFinite(actorId) ? actorId : null, email: auth.session.user?.email ?? null },
    target: { type: "PrescriptionParMail", id },
  });

  return NextResponse.json({ id, rangeeAt: upd.rows[0].rangeeAt });
}

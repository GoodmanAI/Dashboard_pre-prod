import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

/**
 * GET /api/prescriptions/par-mail?userProductId=X
 *
 * Cartes « a verifier dans la boite mail » : RDV dont le patient a ete invite
 * par le robot a envoyer son ordonnance par mail (aucun lien de depot parti).
 * Non rangees, RDV a partir d'aujourd'hui (Europe/Paris), du plus proche au
 * plus lointain. Les RDV passes sortent de la liste sans ecriture.
 *
 * Auth : session NextAuth + ownership + droit de lecture ORDONNANCES.
 *
 * Reponse 200 :
 *   { items: [{ id, examType, appointmentDate, firstname, lastname, phone, createdAt }] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("userProductId");
  const userProductId = param ? parseInt(param, 10) : NaN;
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const droitErr = await requirePagePermission(PAGES.ORDONNANCES, "read");
  if (droitErr) return droitErr;

  const res = await db.query(
    `
    SELECT pm."id", pm."examType", pm."appointmentDate", pm."firstname",
           pm."lastname", pm."phone", pm."createdAt"
      FROM "PrescriptionParMail" pm
      JOIN "ExternalCenterMapping" ecm ON ecm."externalCenterCode" = pm."externalCenterCode"
     WHERE ecm."userProductId" = $1
       AND pm."rangeeAt" IS NULL
       AND pm."appointmentDate" >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')
     ORDER BY pm."appointmentDate" ASC, pm."id" ASC
    `,
    [userProductId]
  );

  return NextResponse.json({ items: res.rows });
}

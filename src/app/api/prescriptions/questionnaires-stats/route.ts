import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

/**
 * GET /api/prescriptions/questionnaires-stats?userProductId=X
 *
 * Bilan des questionnaires du centre demandes aux patients de Konnect, sur les
 * 30 derniers jours (26/10/2026, plan workspace
 * plans/2026-10-konnect-questionnaires-centre.md). Par patient, c'est-a-dire
 * par lien de depot (`PrescriptionUpload.canal = 'konnect'`) qui demande au
 * moins un questionnaire :
 *
 *   - demandes   : liens envoyes dans la periode ;
 *   - remplis    : tous les questionnaires du lien recus ;
 *   - aVerifier  : un questionnaire recu porte une reponse a verifier, non classee ;
 *   - enAttente  : un questionnaire ni recu ni classe, RDV pas encore passe.
 *
 * Les ordonnances n'y entrent pas : Konnect les envoie lui-meme a la
 * reservation. Session et droit `konnect_questionnaires` en lecture ; le
 * `userProductId` est celui qui porte les codes du centre
 * (ExternalCenterMapping), comme pour /api/prescriptions/alerts.
 *
 * Reponse 200 : { userProductId, jours: 30, demandes, remplis, aVerifier, enAttente }
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

  const droitErr = await requirePagePermission(PAGES.KONNECT_QUESTIONNAIRES, "read");
  if (droitErr) return droitErr;

  const res = await db.query<{
    demandes: string;
    remplis: string;
    aVerifier: string;
    enAttente: string;
  }>(
    `
    WITH liens AS (
      SELECT pu."id", pu."appointmentDate",
             COUNT(p."id") AS "nb",
             COUNT(p."recueAt") AS "recus",
             BOOL_OR(p."alertesReponses" IS NOT NULL AND p."alertResolvedAt" IS NULL) AS "aVerifier",
             BOOL_OR(p."recueAt" IS NULL AND p."alertResolvedAt" IS NULL) AS "ouvert"
        FROM "PrescriptionUpload" pu
        JOIN "ExternalCenterMapping" ecm
          ON ecm."externalCenterCode" = pu."externalCenterCode"
         AND ecm."userProductId" = $1
        JOIN "PieceAttendue" p
          ON p."uploadId" = pu."id"
         AND p."piece" = 'document'
       WHERE pu."canal" = 'konnect'
         AND pu."createdAt" >= NOW() - INTERVAL '30 days'
       GROUP BY pu."id", pu."appointmentDate"
    )
    SELECT COUNT(*)::text AS "demandes",
           COUNT(*) FILTER (WHERE "recus" = "nb")::text AS "remplis",
           COUNT(*) FILTER (WHERE "aVerifier")::text AS "aVerifier",
           COUNT(*) FILTER (
             WHERE "ouvert"
               AND NOT (
                 "appointmentDate" IS NOT NULL
                 AND ("appointmentDate" AT TIME ZONE 'Europe/Paris')::date
                     < (NOW() AT TIME ZONE 'Europe/Paris')::date
               )
           )::text AS "enAttente"
      FROM liens
    `,
    [userProductId]
  );
  const ligne = res.rows[0];

  return NextResponse.json({
    userProductId,
    jours: 30,
    demandes: Number(ligne?.demandes ?? 0),
    remplis: Number(ligne?.remplis ?? 0),
    aVerifier: Number(ligne?.aVerifier ?? 0),
    enAttente: Number(ligne?.enAttente ?? 0),
  });
}

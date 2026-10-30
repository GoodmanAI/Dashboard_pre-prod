export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

/**
 * GET /api/konnect-stats-jours?userProductId=NN&semaines=12   (session)
 *
 * Les compteurs quotidiens que Konnect remonte (section `jours` de
 * `POST /api/konnect-remontee`, table `KonnectStatJour`, C-STAT.1), pour l'écran
 * « Statistiques » du centre.
 *
 * LES CLÉS DE L'OCR NE SORTENT PAS D'ICI (décision D4 du 29/10/2026 : la mesure de
 * l'OCR reste interne). Elles sont écartées dans la requête, pas à l'écran : un centre
 * qui lirait la route à la main ne les verrait pas davantage. L'écran admin les lit par
 * `/api/admin/konnect-ocr`.
 *
 * Jamais 404 : un centre qui n'a encore rien remonté reçoit une liste vide.
 */
const SEMAINES_MAX = 53;

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const userProductId = Number(params.get("userProductId"));
  if (!userProductId || Number.isNaN(userProductId)) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }
  const semaines = Math.min(SEMAINES_MAX, Math.max(1, Number(params.get("semaines")) || 12));

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;
  const droitErr = await requirePagePermission(PAGES.KONNECT_STATS, "read");
  if (droitErr) return droitErr;

  // Borne en date ISO castée côté SQL, jamais un objet `Date` (décalage de fuseau).
  const depuis = new Date(Date.now() - semaines * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await db.query<{ jour: string; cle: string; valeur: number; recuAt: Date }>(
    `SELECT to_char("jour", 'YYYY-MM-DD') AS jour, "cle", "valeur", "recuAt"
       FROM "KonnectStatJour"
      WHERE "userProductId" = $1
        AND "jour" >= $2::date
        AND "cle" NOT LIKE 'ocr%'
        AND "cle" NOT LIKE 'lecture.%'
      ORDER BY "jour"`,
    [userProductId, depuis]
  );

  let recuAt: Date | null = null;
  for (const l of res.rows) if (!recuAt || l.recuAt > recuAt) recuAt = l.recuAt;
  return NextResponse.json({
    userProductId,
    depuis,
    lignes: res.rows.map(({ jour, cle, valeur }) => ({ jour, cle, valeur })),
    recuAt,
  });
}

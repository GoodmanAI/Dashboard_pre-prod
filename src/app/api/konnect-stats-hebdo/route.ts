export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * Les compteurs quotidiens de Konnect, tous centres, pour le rapport hebdomadaire interne
 * (daily-report, `src/konnect/hebdo.js`, lot 4 de `plans/2026-10-konnect-stats-surveillance-ocr.md`).
 *
 *  GET /api/konnect-stats-hebdo?depuis=AAAA-MM-JJ&jusqua=AAAA-MM-JJ   (x-api-key: DAILY_REPORT_API_KEY)
 *
 * Clé API SEULE, jamais une session : la route rend tous les centres ET les clés de l'OCR,
 * que la route du centre écarte (D4 du 29/10/2026). `jusqua` est exclu. Ne rend que des
 * agrégats (`KonnectStatJour`), aucune donnée patient.
 */

const FENETRE_MAX_JOURS = 63;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function lireJour(valeur: string | null): string | null {
  if (!valeur || !JOUR.test(valeur)) return null;
  return Number.isNaN(Date.parse(`${valeur}T00:00:00Z`)) ? null : valeur;
}

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "DAILY_REPORT_API_KEY");
  if (keyErr) return keyErr;

  const params = new URL(req.url).searchParams;
  const depuis = lireJour(params.get("depuis"));
  const jusqua = lireJour(params.get("jusqua"));
  if (!depuis || !jusqua) {
    return NextResponse.json(
      { error: "`depuis` et `jusqua` sont attendus au format AAAA-MM-JJ" },
      { status: 400 }
    );
  }
  const ecart = (Date.parse(`${jusqua}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`)) / 86400000;
  if (ecart <= 0 || ecart > FENETRE_MAX_JOURS) {
    return NextResponse.json(
      { error: `\`depuis\` doit précéder \`jusqua\`, ${FENETRE_MAX_JOURS} jours au plus` },
      { status: 400 }
    );
  }

  // Bornes en date ISO castée côté SQL, jamais un objet `Date` (décalage de fuseau).
  const [lignes, centres] = await Promise.all([
    db.query<{ userProductId: number; jour: string; cle: string; valeur: number }>(
      `SELECT "userProductId", to_char("jour", 'YYYY-MM-DD') AS jour, "cle", "valeur"
         FROM "KonnectStatJour"
        WHERE "jour" >= $1::date AND "jour" < $2::date
        ORDER BY "userProductId", "jour"`,
      [depuis, jusqua]
    ),
    db.query<{ userProductId: number; nom: string | null; dernierRecu: Date }>(
      `SELECT s."userProductId", u."name" AS nom, max(s."recuAt") AS "dernierRecu"
         FROM "KonnectStatJour" s
         JOIN "UserProduct" up ON up."id" = s."userProductId"
         JOIN "User" u ON u."id" = up."userId"
        GROUP BY s."userProductId", u."name"
        ORDER BY u."name"`
    ),
  ]);

  return NextResponse.json({ depuis, jusqua, lignes: lignes.rows, centres: centres.rows });
}

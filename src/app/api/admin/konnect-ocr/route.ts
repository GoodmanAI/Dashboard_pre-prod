export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

/**
 * GET /api/admin/konnect-ocr?semaines=8   (ADMIN)
 *
 * La mesure de l'OCR de Konnect, tous centres (C-OCR.1, remontée par C-STAT.1) : les
 * clés `ocr*` de `KonnectStatJour`, que la route du centre écarte (D4). Interne :
 * réservé aux ADMIN, aucun centre ne voit ces chiffres.
 *
 * Renvoie aussi, par centre, la date de la dernière remontée des jours : un centre qui
 * ne remonte plus se voit ici avant qu'on s'étonne d'un trou dans la série.
 */
const SEMAINES_MAX = 53;

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const brut = Number(new URL(req.url).searchParams.get("semaines"));
  const semaines = Math.min(SEMAINES_MAX, Math.max(1, brut || 8));
  const depuis = new Date(Date.now() - semaines * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [lignes, centres] = await Promise.all([
    db.query<{ userProductId: number; jour: string; cle: string; valeur: number }>(
      `SELECT "userProductId", to_char("jour", 'YYYY-MM-DD') AS jour, "cle", "valeur"
         FROM "KonnectStatJour"
        WHERE "jour" >= $1::date AND ("cle" LIKE 'ocr%' OR "cle" = 'demandes_deposees')
        ORDER BY "jour"`,
      [depuis]
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

  return NextResponse.json({ depuis, lignes: lignes.rows, centres: centres.rows });
}

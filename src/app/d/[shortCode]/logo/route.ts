import { db } from "@/lib/db";
import { reponseImageApercu } from "@/lib/logoClient";

export const dynamic = "force-dynamic";

const DEPOT_BASE_URL =
  process.env.DEPOT_ORDONNANCES_URL_BASE || "https://depot-ordonnances.neuracorp.ai";

/**
 * Image de l'aperçu du lien de dépôt d'ordonnance et de questionnaires (28/11/2026) : le
 * logo du centre, sinon celui de Neuracorp. Publique (déclarée dans la liste blanche de
 * `depot-ordonnances.neuracorp.ai`) : aucune donnée du dépôt n'en sort, le code court ne
 * sert qu'à trouver le centre. Plan `lyrae/plans/2026-11-logo-du-client.md`.
 */
export async function GET(_req: Request, { params }: { params: { shortCode: string } }) {
  const code = params.shortCode;
  let centre: number | null = null;
  if (code && code.length >= 4 && code.length <= 32) {
    const r = await db
      .query<{ centerId: number }>(
        `SELECT "centerId" FROM "PrescriptionUpload" WHERE "shortCode" = $1 LIMIT 1`,
        [code]
      )
      .catch(() => null);
    centre = r?.rows[0]?.centerId ?? null;
  }
  return reponseImageApercu(centre, DEPOT_BASE_URL);
}

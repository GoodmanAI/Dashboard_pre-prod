import { db } from "@/lib/db";
import { reponseImageApercu } from "@/lib/logoClient";

export const dynamic = "force-dynamic";

const RDV_BASE_URL = process.env.RDV_SHORT_URL_BASE || "https://rdv.neuracorp.ai";

/**
 * Image de l'aperçu du lien de relance no-show (28/11/2026) : le logo du centre, sinon
 * celui de Neuracorp. Publique (déclarée dans la liste blanche de `rdv.neuracorp.ai`) :
 * le logo figure sur le site du centre, et le code court ne sert qu'à trouver le centre.
 * Aucune donnée du rendez-vous n'en sort. Plan `lyrae/plans/2026-11-logo-du-client.md`.
 */
export async function GET(_req: Request, { params }: { params: { shortCode: string } }) {
  const code = params.shortCode;
  let centre: number | null = null;
  if (code && code.length >= 4 && code.length <= 32) {
    const r = await db
      .query<{ centerId: number }>(
        `SELECT "centerId" FROM "AppointmentConfirmation" WHERE "shortCode" = $1 LIMIT 1`,
        [code]
      )
      .catch(() => null);
    centre = r?.rows[0]?.centerId ?? null;
  }
  return reponseImageApercu(centre, RDV_BASE_URL);
}

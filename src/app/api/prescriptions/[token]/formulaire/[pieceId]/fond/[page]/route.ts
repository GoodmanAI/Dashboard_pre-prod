import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lienOuvert } from "@/lib/prescriptionDocuments";
import { formulaireDeLaPiece } from "@/lib/formulairesPdf";

/**
 * GET /api/prescriptions/[token]/formulaire/[pieceId]/fond/[page]
 *
 * Rendu d'une page du modele vierge, prepare avec le formulaire : la page du
 * patient dessine ses reponses par-dessus pour l'apercu, avant l'envoi.
 * Meme regle que /modele/[pieceId] : un formulaire vierge du centre, pas une
 * donnee patient, servi seulement depuis un lien ouvert.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; pieceId: string; page: string } }
) {
  if (!/^\d+$/.test(params.pieceId) || !/^\d+$/.test(params.page)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const res = await db.query<{ id: number; status: string; expiresAt: Date }>(
    `SELECT "id", "status", "expiresAt" FROM "PrescriptionUpload" WHERE "token" = $1 LIMIT 1`,
    [params.token]
  );
  const lien = res.rows[0];
  if (!lien || !lienOuvert(lien.status, lien.expiresAt)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const trouve = await formulaireDeLaPiece(lien.id, parseInt(params.pieceId, 10));
  const page = trouve?.formulaire.pages[parseInt(params.page, 10) - 1];
  const m = page ? /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(page.fond) : null;
  if (!m) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
    status: 200,
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

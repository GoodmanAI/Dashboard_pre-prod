import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lienOuvert } from "@/lib/prescriptionDocuments";

/**
 * GET /api/prescriptions/[token]/modele/[pieceId]
 *
 * Le patient telecharge le modele vierge d'un document demande (questionnaire
 * IRM du centre...), le remplit, puis le renvoie par /upload.
 * Plan : plans/2026-10-documents-demandes.md (workspace).
 *
 * Public, comme /status et /upload : le jeton du lien suffit, sans le code du
 * SMS. Le modele est un formulaire vierge du centre, pas une donnee patient ;
 * il ne s'obtient pourtant que depuis un lien valide, jamais par une URL
 * devinable a partir de l'id du document. Pas d'entree dans
 * PrescriptionAccessLog (liste d'actions fermee, et rien du patient n'est lu).
 *
 * La version servie est celle du jour : un modele remplace par l'admin vaut
 * aussi pour les liens deja envoyes.
 *
 * 404 : lien inconnu, echu ou verrouille ; piece d'un autre lien ; document
 * sans modele.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; pieceId: string } }
) {
  const pieceId = /^\d+$/.test(params.pieceId)
    ? parseInt(params.pieceId, 10)
    : null;
  if (pieceId === null) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const res = await db.query<{
    status: string;
    expiresAt: Date;
    modeleContenu: Buffer | null;
    modeleType: string | null;
    modeleNom: string | null;
  }>(
    `SELECT pu."status", pu."expiresAt",
            dd."modeleContenu", dd."modeleType", dd."modeleNom"
       FROM "PrescriptionUpload" pu
       JOIN "PieceAttendue" p ON p."uploadId" = pu."id"
       JOIN "DocumentDemande" dd ON dd."id" = p."documentDemandeId"
      WHERE pu."token" = $1
        AND p."id" = $2
      LIMIT 1`,
    [params.token, pieceId]
  );
  const row = res.rows[0];
  if (
    !row ||
    row.status === "LOCKED" ||
    !lienOuvert(row.status, row.expiresAt) ||
    !row.modeleContenu
  ) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const nom = (row.modeleNom || "questionnaire.pdf").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(row.modeleContenu), {
    status: 200,
    headers: {
      "Content-Type": row.modeleType || "application/pdf",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

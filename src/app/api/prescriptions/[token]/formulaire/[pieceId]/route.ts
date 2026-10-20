import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/prescriptionRateLimit";
import { acteurDe, journalPatient, lienOuvertOuRefus, refusDuCode } from "@/lib/depotPatient";
import { formulaireDeLaPiece } from "@/lib/formulairesPdf";
import { formulairePourLaPage } from "@/lib/formulaires";

/**
 * POST /api/prescriptions/[token]/formulaire/[pieceId]   body { code }
 *
 * Ouvre le questionnaire en ligne d'une piece : les questions, les places
 * (l'apercu les dessine sur le rendu du modele) et les valeurs proposees
 * d'apres le lien (nom, prenom, portable). Le code du SMS est exige, comme
 * pour un depot : le nom complet et le portable n'apparaissent jamais sur la
 * page sans lui. Un mauvais code compte un essai.
 * Plan : plans/2026-10-questionnaires-en-ligne.md (workspace).
 *
 * 404 : lien inconnu ou piece sans formulaire valable (la page garde alors le
 * parcours telecharger, remplir, redeposer).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; pieceId: string } }
) {
  const acteur = acteurDe(req);
  const rate = await checkRateLimit(acteur.actorIp);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.reason },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  if (!/^\d+$/.test(params.pieceId)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const charge = await lienOuvertOuRefus(params.token, "formulaire", acteur);
  if ("refus" in charge) return charge.refus;
  const lien = charge.lien;

  const body = await req.json().catch(() => ({}));
  const codeRefuse = await refusDuCode(lien, body?.code, acteur);
  if (codeRefuse) return codeRefuse;

  const trouve = await formulaireDeLaPiece(lien.id, parseInt(params.pieceId, 10));
  if (!trouve) {
    return NextResponse.json(
      { error: "Ce questionnaire ne se remplit pas en ligne. Téléchargez-le." },
      { status: 404 }
    );
  }

  await journalPatient({ ...acteur, uploadId: lien.id, action: "formulaire", success: true });

  return NextResponse.json(
    {
      libelle: trouve.libelle,
      formulaire: formulairePourLaPage(trouve.formulaire),
      prerempli: {
        nom: lien.lastname,
        prenom: lien.firstname,
        telephone: lien.phone,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

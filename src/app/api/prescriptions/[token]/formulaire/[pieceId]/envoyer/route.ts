import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/prescriptionRateLimit";
import { MAX_DOCUMENTS_PAR_PIECE } from "@/lib/piecesAttendues";
import {
  acteurDe,
  journalPatient,
  lienOuvertOuRefus,
  pieceDuLien,
  plafondAtteint,
  rangerDocument,
  refusDuCode,
} from "@/lib/depotPatient";
import { alertesDe, verifierReponses } from "@/lib/formulaires";
import { formulaireDeLaPiece, lireSignature, remplirPdf } from "@/lib/formulairesPdf";

/**
 * POST /api/prescriptions/[token]/formulaire/[pieceId]/envoyer
 * body JSON { code, reponses: { [champ]: string | string[] | boolean },
 *             signature: "data:image/png;base64,..." }
 *
 * Le patient a rempli le questionnaire sur la page et confirme. Le serveur
 * reverifie les reponses (memes regles que la page), les ecrit dans le PDF du
 * centre avec la signature et la date du jour, puis range le PDF comme un
 * depot (`rangerDocument` : antivirus, plafond par piece sous verrou, piece
 * recue, journal). Le PDF part ensuite dans Xplore par la file `pending`,
 * comme un questionnaire telecharge puis redepose.
 *
 * Les reponses ne sont pas gardees en base : seul le PDF l'est. Une reponse
 * marquee `alerte` dans le formulaire pose son libelle sur la piece
 * (« Réponses à vérifier » de l'ecran secretaire).
 * Plan : plans/2026-10-questionnaires-en-ligne.md (workspace).
 *
 * 400 : reponses incompletes (`erreurs` par champ) ou signature absente.
 * 404 : piece sans formulaire valable (modele remplace entre-temps...).
 * 409 / 422 : lien echu, verrouille, code faux, plafond, comme /upload.
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
  const pieceId = parseInt(params.pieceId, 10);

  const charge = await lienOuvertOuRefus(params.token, "formulaire_envoi", acteur);
  if ("refus" in charge) return charge.refus;
  const lien = charge.lien;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const codeRefuse = await refusDuCode(lien, body.code, acteur);
  if (codeRefuse) return codeRefuse;

  const piece = await pieceDuLien(lien.id, pieceId);
  const trouve = piece ? await formulaireDeLaPiece(lien.id, pieceId) : null;
  if (!piece || !trouve) {
    return NextResponse.json(
      {
        error:
          "Ce questionnaire ne se remplit plus en ligne. Rechargez la page pour le télécharger.",
      },
      { status: 404 }
    );
  }
  if (piece.nbDocuments >= MAX_DOCUMENTS_PAR_PIECE) {
    return plafondAtteint(piece.libelle);
  }

  const verifie = verifierReponses(trouve.formulaire, body.reponses);
  if (!verifie.ok) {
    return NextResponse.json(
      {
        error: "Il manque des réponses. Revenez aux questions signalées.",
        erreurs: verifie.erreurs,
      },
      { status: 400 }
    );
  }
  const attendSignature = trouve.formulaire.champs.some((c) => c.type === "signature");
  const signature = lireSignature(body.signature);
  if (attendSignature && !signature) {
    return NextResponse.json(
      { error: "Signez dans le cadre avant d'envoyer." },
      { status: 400 }
    );
  }

  let pdf: Uint8Array;
  try {
    pdf = await remplirPdf(trouve.modele, trouve.formulaire, verifie.reponses, signature);
  } catch (err) {
    console.error("[prescriptions/formulaire] remplissage du PDF impossible:", err);
    await journalPatient({
      ...acteur,
      uploadId: lien.id,
      action: "formulaire_envoi",
      success: false,
      errorReason: "pdf fill failed",
    });
    return NextResponse.json(
      {
        error:
          "Le questionnaire n'a pas pu être préparé. Réessayez, ou téléchargez-le pour le remplir à la main.",
      },
      { status: 500 }
    );
  }

  const alertes = alertesDe(trouve.formulaire, verifie.reponses);
  const range = await rangerDocument({
    ...acteur,
    token: params.token,
    lien,
    piece,
    buffer: Buffer.from(pdf),
    extension: "pdf",
    action: "formulaire_envoi",
    alertes,
  });
  if (!range.ok) return range.refus;

  return NextResponse.json({
    status: "UPLOADED",
    nbDocuments: range.nbDocuments,
    maxDocuments: MAX_DOCUMENTS_PAR_PIECE,
    pieceId: piece.id,
    message: "Questionnaire envoyé. Il sera transmis au centre.",
  });
}

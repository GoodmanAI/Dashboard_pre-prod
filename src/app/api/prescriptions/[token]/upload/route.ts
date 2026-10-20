import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/prescriptionRateLimit";
import { detectFileType } from "@/lib/prescriptionFileType";
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

/**
 * Endpoint patient public (auth = shortCode dans l'URL + verificationCode
 * dans le body). Servi sur le sous-domaine depot-ordonnances.neuracorp.ai
 * qui est isole par le middleware — seules les routes /d/[shortCode] et
 * /api/prescriptions/[token]/{status,upload} sont accessibles.
 *
 * Body attendu (multipart/form-data) :
 *   code: string    — 6 chiffres du SMS
 *   file: File      — ordonnance en PDF/JPG/PNG (100 B .. 8 MB)
 *   pieceId?: string — la piece attendue a laquelle le fichier repond
 *                      (absent : l'ordonnance, ou a defaut la premiere piece ;
 *                      pages ouvertes avant le 11/10/2026)
 *
 * Formats acceptes (compatibles Xplore RIS/PACS) : PDF, JPEG, PNG.
 * HEIC (iPhone) et WebP (Android) rejetes avec message d'aide dedie
 * (patient invite a reprendre en JPG ou envoyer un PDF).
 *
 * Chaine de validation (fail au 1er echec) :
 *   1. Token existe                    → 404 sinon
 *   2. Lien ouvert (ni LOCKED, ni EXPIRED, RDV pas encore passe) → 409 sinon
 *   3. Code correct                    → 422 + attempts++ sinon (LOCKED a 3)
 *   4. Piece du lien, moins de 5 documents deja recus pour elle → 400/409 sinon
 *   5. Fichier present, taille bornee  → 400/413 sinon
 *   6. Magic bytes PDF/JPEG/PNG        → 415 sinon (message dedie HEIC/WebP)
 *   7. Antivirus ClamAV clean          → 422 sinon (log alerte)
 *
 * Si tout passe : ecrit sur disque, AJOUTE une ligne PrescriptionDocument,
 * passe le lien en UPLOADED au premier document, log l'audit, incremente
 * PrescriptionStats.uploaded au premier document du lien.
 *
 * Plusieurs documents (depuis le 08/10/2026) : un envoi = un fichier = un
 * document. Depuis le 11/10/2026 (documents demandes), le plafond vaut par
 * piece attendue : MAX_DOCUMENTS_PAR_PIECE, en plusieurs fois, jusqu'a
 * l'heure du RDV. Plus de remplacement : un document deja parti
 * dans Xplore ne se retire pas d'ici. Le plafond est verifie sous verrou de
 * la ligne du lien (deux envois simultanes ne font pas un sixieme).
 *
 * Depuis le 20/10/2026, le chemin commun (lien, code, antivirus, rangement)
 * vit dans src/lib/depotPatient.ts : le questionnaire rempli en ligne
 * (`formulaire/[pieceId]/envoyer`) le partage.
 */

const MIN_FILE_SIZE = 100; // < ca c'est pas un PDF utilisable
// Cap fichier fixe a 8 MB (au lieu de 10 MB initialement) : contrainte Xplore
// qui refuse toute ordonnance dont le base64 depasse 12 MB (le PDF binaire
// est encode base64 dans le payload SendOrdonnance). 8 MB * 1.33 = 10.7 MB
// base64, sous les 12 MB avec marge. Nginx reste a 10 MB (client_max_body_size)
// pour absorber les headers multipart, le blocage strict est ici.
const MAX_FILE_SIZE = 8 * 1024 * 1024;

// La detection de format (PDF / JPEG / PNG / HEIC-rejete / WebP-rejete) est
// deleguee au helper src/lib/prescriptionFileType.ts qui verifie les magic
// bytes independamment du Content-Type client (manipulable).

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const acteur = acteurDe(req);

  // ------ 0. Rate limit IP ------
  // Bloque avant tout requetage DB pour ne pas surcharger sous flood.
  const rateCheck = await checkRateLimit(acteur.actorIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: rateCheck.reason },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      }
    );
  }

  // ------ 1 et 2. Lien connu et ouvert ------
  const charge = await lienOuvertOuRefus(params.token, "upload", acteur);
  if ("refus" in charge) return charge.refus;
  const record = charge.lien;

  // ------ 3. Parse multipart form ------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Requete invalide (multipart attendu)" },
      { status: 400 }
    );
  }

  const codeRaw = formData.get("code");
  const fileRaw = formData.get("file");
  const pieceIdRaw = formData.get("pieceId");
  if (typeof codeRaw !== "string" || !(fileRaw instanceof File)) {
    return NextResponse.json(
      { error: "Champs manquants : code et file requis" },
      { status: 400 }
    );
  }

  // ------ 4. Verification code ------
  const codeRefuse = await refusDuCode(record, codeRaw, acteur);
  if (codeRefuse) return codeRefuse;

  // ------ 5. Piece visee et plafond (lecture rapide, reverifie sous verrou) ------
  const pieceIdDemande =
    typeof pieceIdRaw === "string" && /^\d+$/.test(pieceIdRaw)
      ? parseInt(pieceIdRaw, 10)
      : null;
  const piece = await pieceDuLien(record.id, pieceIdDemande);
  if (!piece) {
    return NextResponse.json(
      { error: "Ce document n'est pas demandé pour ce rendez-vous. Rechargez la page." },
      { status: 400 }
    );
  }
  if (piece.nbDocuments >= MAX_DOCUMENTS_PAR_PIECE) {
    return plafondAtteint(piece.libelle);
  }

  // ------ 6. Validation fichier (taille + MIME + structure PDF) ------
  if (fileRaw.size < MIN_FILE_SIZE) {
    return NextResponse.json(
      {
        error:
          "Ce fichier est trop petit pour être lisible. Choisissez-en un autre.",
      },
      { status: 400 }
    );
  }
  if (fileRaw.size > MAX_FILE_SIZE) {
    const maxMb = MAX_FILE_SIZE / 1024 / 1024;
    return NextResponse.json(
      {
        error: `Fichier trop lourd (${maxMb} Mo au plus). Réduisez la qualité de la photo ou scannez en noir et blanc.`,
      },
      { status: 413 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await fileRaw.arrayBuffer());
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de lire le fichier. Réessayez ou choisissez-en un autre.",
      },
      { status: 400 }
    );
  }

  // Detection par magic bytes : PDF, JPEG, PNG acceptes.
  // HEIC (iPhone) et WebP (Android) rejetes avec message d'aide dedie.
  const validation = detectFileType(buffer);
  if (!validation.ok) {
    await journalPatient({
      ...acteur,
      uploadId: record.id,
      action: "upload",
      success: false,
      errorReason: validation.rejectedFormat
        ? `rejected format: ${validation.rejectedFormat}`
        : `invalid file: ${validation.reason}`,
    });
    return NextResponse.json(
      {
        error: validation.reason,
        rejectedFormat: validation.rejectedFormat,
      },
      { status: 415 }
    );
  }

  // ------ 7 a 12. Antivirus, disque, document sous verrou, compteur, journal, websocket ------
  const range = await rangerDocument({
    ...acteur,
    token: params.token,
    lien: record,
    piece,
    buffer,
    extension: validation.extension,
    action: "upload",
  });
  if (!range.ok) return range.refus;

  return NextResponse.json(
    {
      status: "UPLOADED",
      nbDocuments: range.nbDocuments,
      maxDocuments: MAX_DOCUMENTS_PAR_PIECE,
      pieceId: piece.id,
      message: "Document envoyé. Il sera transmis au centre.",
    },
    { status: 200 }
  );
}

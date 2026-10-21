import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lienOuvert } from "@/lib/prescriptionDocuments";
import { MAX_DOCUMENTS_PAR_PIECE, piecesDuLien } from "@/lib/piecesAttendues";

/**
 * Endpoint public consulte par la page /d/[shortCode] au premier chargement
 * pour rendre le formulaire (afficher le prenom + date de RDV + statut).
 *
 * Auth : none — le token dans l'URL suffit a authentifier la lecture
 * "publique" (pas de donnees sensibles renvoyees, juste ce que le patient
 * a deja dans son SMS).
 *
 * PAS de leak d'infos qui aideraient un attaquant qui devinerait un
 * shortCode : on renvoie prenom + initiale nom uniquement (rassure le
 * patient qu'il est au bon endroit sans exposer un nom complet). Pas de
 * telephone, pas de date de naissance, pas de rdvId brut.
 *
 * Reponse :
 *   200 {
 *     status: "PENDING" | "UPLOADED" | "ACKED" | "REJECTED" | "LOCKED",
 *     patientLabel: "Jean D.",              // prenom + initiale nom
 *     appointmentDate: ISO | null,
 *     examType: "scanner" | ...             // sert au libelle UI
 *     canUpload: boolean,                   // une piece au moins accepte encore un document
 *     expiresAt: ISO,
 *     attemptsLeft: number,                 // sur 3 (pour affichage warning)
 *     documents: [{ uploadedAt: ISO }],     // tous les documents du lien
 *     maxDocuments: 5,                      // par piece
 *     messageCentre: string | null,         // depuis le 21/10/2026, PrescriptionConfig.messagePatient
 *     pieces: [{                            // depuis le 11/10/2026
 *       id, piece: "ordonnance" | "document", libelle, avecModele,
 *       enLigne,                            // depuis le 20/10/2026 : questionnaire a remplir sur la page
 *       documents: [{ uploadedAt: ISO }], canUpload
 *     }]
 *   }
 *   404 lien invalide, ou expire (heure du RDV passee) : un lien echu n'est
 *       plus consultable, et on ne distingue pas l'inconnu de l'echu.
 *
 * Un LOCKED renvoie son statut sans libelle patient ni documents.
 */

const APPOINTMENT_MAX_ATTEMPTS = 3;

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const sel = await db.query<{
    id: number;
    status: string;
    firstname: string;
    lastname: string;
    examType: string | null;
    appointmentDate: Date | null;
    expiresAt: Date;
    attempts: number;
    messageCentre: string | null;
  }>(
    `SELECT pu."id", pu."status", pu."firstname", pu."lastname", pu."examType",
            pu."appointmentDate", pu."expiresAt", pu."attempts",
            pc."messagePatient" AS "messageCentre"
       FROM "PrescriptionUpload" pu
       LEFT JOIN "ExternalCenterMapping" m ON m."externalCenterCode" = pu."externalCenterCode"
       LEFT JOIN "PrescriptionConfig" pc ON pc."userProductId" = m."userProductId"
      WHERE pu."token" = $1
      LIMIT 1`,
    [params.token]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const record = sel.rows[0];

  if (record.status === "LOCKED") {
    return NextResponse.json({ status: "LOCKED", canUpload: false });
  }
  if (!lienOuvert(record.status, record.expiresAt)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const docs = await db.query<{
    uploadedAt: Date;
    pieceAttendueId: number | null;
  }>(
    `SELECT "uploadedAt", "pieceAttendueId" FROM "PrescriptionDocument"
      WHERE "uploadId" = $1
      ORDER BY "uploadedAt" ASC, "id" ASC`,
    [record.id]
  );
  const pieces = (await piecesDuLien(record.id)).map((p) => {
    const recus = docs.rows
      .filter((d) => d.pieceAttendueId === p.id)
      .map((d) => ({ uploadedAt: d.uploadedAt }));
    return {
      id: p.id,
      piece: p.piece,
      libelle: p.libelle,
      avecModele: p.avecModele,
      enLigne: p.enLigne,
      documents: recus,
      canUpload: recus.length < MAX_DOCUMENTS_PAR_PIECE,
    };
  });

  // Prenom + initiale nom (ex: "Jean D.") — reconnaissance sans leak
  const initial = record.lastname
    ? record.lastname.charAt(0).toUpperCase()
    : "";
  const patientLabel = initial
    ? `${record.firstname} ${initial}.`
    : record.firstname;

  const attemptsLeft = Math.max(0, APPOINTMENT_MAX_ATTEMPTS - record.attempts);

  return NextResponse.json({
    status: record.status,
    patientLabel,
    appointmentDate: record.appointmentDate,
    examType: record.examType,
    messageCentre: record.messageCentre ?? null,
    canUpload: pieces.some((p) => p.canUpload),
    expiresAt: record.expiresAt,
    attemptsLeft,
    documents: docs.rows.map((d) => ({ uploadedAt: d.uploadedAt })),
    maxDocuments: MAX_DOCUMENTS_PAR_PIECE,
    pieces,
  });
}

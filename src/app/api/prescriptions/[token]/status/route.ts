import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  MAX_DOCUMENTS_PAR_LIEN,
  lienOuvert,
} from "@/lib/prescriptionDocuments";

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
 *     canUpload: boolean,                   // lien ouvert et moins de 5 documents
 *     expiresAt: ISO,
 *     attemptsLeft: number,                 // sur 3 (pour affichage warning)
 *     documents: [{ uploadedAt: ISO }],     // deja envoyes, du plus ancien au plus recent
 *     maxDocuments: 5
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
  }>(
    `SELECT "id", "status", "firstname", "lastname", "examType",
            "appointmentDate", "expiresAt", "attempts"
       FROM "PrescriptionUpload"
      WHERE "token" = $1
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

  const docs = await db.query<{ uploadedAt: Date }>(
    `SELECT "uploadedAt" FROM "PrescriptionDocument"
      WHERE "uploadId" = $1
      ORDER BY "uploadedAt" ASC, "id" ASC`,
    [record.id]
  );

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
    canUpload: docs.rows.length < MAX_DOCUMENTS_PAR_LIEN,
    expiresAt: record.expiresAt,
    attemptsLeft,
    documents: docs.rows,
    maxDocuments: MAX_DOCUMENTS_PAR_LIEN,
  });
}

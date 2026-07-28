import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
 *     status: "PENDING" | "UPLOADED" | "ACKED" | "EXPIRED" | "LOCKED",
 *     patientLabel: "Jean D.",              // prenom + initiale nom
 *     appointmentDate: ISO | null,
 *     examType: "scanner" | ...             // sert au libelle UI
 *     canUpload: boolean,                   // true si PENDING ou UPLOADED-non-acke
 *     expiresAt: ISO,
 *     attemptsLeft: number                  // sur 3 (pour affichage warning)
 *   }
 *   404 lien invalide
 */

const APPOINTMENT_MAX_ATTEMPTS = 3;

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const sel = await db.query<{
    status: string;
    firstname: string;
    lastname: string;
    examType: string | null;
    appointmentDate: Date | null;
    expiresAt: Date;
    attempts: number;
    ackedAt: Date | null;
  }>(
    `SELECT "status", "firstname", "lastname", "examType",
            "appointmentDate", "expiresAt", "attempts", "ackedAt"
       FROM "PrescriptionUpload"
      WHERE "token" = $1
      LIMIT 1`,
    [params.token]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const record = sel.rows[0];

  // Prenom + initiale nom (ex: "Jean D.") — reconnaissance sans leak
  const initial = record.lastname
    ? record.lastname.charAt(0).toUpperCase()
    : "";
  const patientLabel = initial
    ? `${record.firstname} ${initial}.`
    : record.firstname;

  const canUpload =
    record.status === "PENDING" ||
    (record.status === "UPLOADED" && record.ackedAt === null);

  const attemptsLeft = Math.max(0, APPOINTMENT_MAX_ATTEMPTS - record.attempts);

  return NextResponse.json({
    status: record.status,
    patientLabel,
    appointmentDate: record.appointmentDate,
    examType: record.examType,
    canUpload,
    expiresAt: record.expiresAt,
    attemptsLeft,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { APPOINTMENT_MAX_ATTEMPTS } from "@/lib/appointmentToken";

/**
 * Endpoint public appelé par la page /c/[shortCode] (ou /confirm/[token]) à
 * la soumission du patient.
 *
 * Body : { code: string, action: "CONFIRMED" | "CANCELLED" }
 *
 * Règles :
 *  - Lien introuvable / mauvais token → 404.
 *  - Statut non PENDING → 409 (déjà traité / expiré / verrouillé).
 *  - Expiration dépassée → statut passé à EXPIRED, 409.
 *  - Code faux → incrémente attempts ; si attempts ≥ MAX → LOCKED.
 *  - Code OK → status = action, respondedAt = now.
 *
 * Le code est un 6 chiffres généré à init et envoyé au patient par SMS.
 * Ne PAS confondre avec le token HMAC de l'URL — celui-ci prouve juste que
 * l'URL vient bien de nous, il ne suffit pas à confirmer/annuler seul.
 * Un attaquant qui devine le shortCode d'un patient tomberait sur le
 * formulaire mais serait bloqué au code (3/1M avec 3 essais = 0.0003%).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { code, action } = body ?? {};
  if (
    typeof code !== "string" ||
    (action !== "CONFIRMED" && action !== "CANCELLED")
  ) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const sel = await db.query<{
    id: number;
    status: string;
    attempts: number;
    expiresAt: Date;
    verificationCode: string;
    externalCenterCode: string | null;
    examType: string | null;
  }>(
    `SELECT "id", "status", "attempts", "expiresAt", "verificationCode",
            "externalCenterCode", "examType"
       FROM "AppointmentConfirmation"
      WHERE "token" = $1
      LIMIT 1`,
    [params.token]
  );

  if (sel.rowCount === 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const record = sel.rows[0];

  if (record.status !== "PENDING") {
    return NextResponse.json(
      { error: "Ce rendez-vous a déjà été traité.", status: record.status },
      { status: 409 }
    );
  }

  if (record.expiresAt < new Date()) {
    await db.query(
      `UPDATE "AppointmentConfirmation" SET "status" = 'EXPIRED' WHERE "id" = $1`,
      [record.id]
    );
    return NextResponse.json(
      { error: "Ce lien a expiré.", status: "EXPIRED" },
      { status: 409 }
    );
  }

  // Comparaison stricte (trim pour absorber un espace en fin quand le
  // patient copie-colle depuis le SMS, mais pas de tolérance de casse : les
  // codes ne contiennent que des chiffres).
  const submittedCode = code.trim();
  const codeOk = submittedCode === record.verificationCode;

  if (!codeOk) {
    const nextAttempts = record.attempts + 1;
    const locked = nextAttempts >= APPOINTMENT_MAX_ATTEMPTS;
    await db.query(
      `UPDATE "AppointmentConfirmation"
          SET "attempts" = $2,
              "status"   = $3
        WHERE "id" = $1`,
      [record.id, nextAttempts, locked ? "LOCKED" : "PENDING"]
    );
    return NextResponse.json(
      {
        error: "Code incorrect.",
        status: locked ? "LOCKED" : "PENDING",
        attemptsLeft: locked ? 0 : APPOINTMENT_MAX_ATTEMPTS - nextAttempts,
      },
      { status: 422 }
    );
  }

  const upd = await db.query<{ status: string; respondedAt: Date }>(
    `UPDATE "AppointmentConfirmation"
        SET "status"          = $2,
            "respondedAction" = $2,
            "respondedAt"     = NOW()
      WHERE "id" = $1
      RETURNING "status", "respondedAt"`,
    [record.id, action]
  );

  // Hook stats no-show : incrémenter le compteur ReminderStats (agrégat non
  // purgé) pour (externalCenterCode, examType, jour civil Europe/Paris).
  // Le fait qu'un rappel ait ou non ete envoye avant est independant : le
  // patient peut confirmer/annuler meme sans SMS, et on veut tracker toutes
  // les reponses. Si externalCenterCode est NULL (edge case, ne devrait
  // jamais arriver en prod), on skip pour ne pas polluer les stats.
  if (record.externalCenterCode) {
    const respondedAt = upd.rows[0]?.respondedAt ?? new Date();
    const isConfirmed = action === "CONFIRMED";
    try {
      await db.query(
        `
        INSERT INTO "ReminderStats"
          ("externalCenterCode", "examType", "day",
           "smsSent", "confirmed", "cancelled", "updatedAt")
        VALUES (
          $1, $2,
          ($3::timestamptz AT TIME ZONE 'Europe/Paris')::date,
          0, $4, $5, NOW()
        )
        ON CONFLICT ("externalCenterCode", (COALESCE("examType", 'unknown')), "day")
        DO UPDATE
          SET "confirmed" = "ReminderStats"."confirmed" + EXCLUDED."confirmed",
              "cancelled" = "ReminderStats"."cancelled" + EXCLUDED."cancelled",
              "updatedAt" = NOW()
        `,
        [
          record.externalCenterCode,
          record.examType,
          respondedAt.toISOString(),
          isConfirmed ? 1 : 0,
          isConfirmed ? 0 : 1,
        ]
      );
    } catch (err) {
      // On ne veut PAS que l'echec d'un compteur invalide la reponse patient
      // (elle est deja UPDATE-ee au-dessus). On log et on continue.
      console.error("[rdv/respond] ReminderStats upsert failed:", err);
    }
  }

  return NextResponse.json(upd.rows[0]);
}

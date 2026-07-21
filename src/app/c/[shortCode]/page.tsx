import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import AppointmentConfirmForm from "@/app/confirm/AppointmentConfirmForm";

/**
 * URL courte du SMS de rappel no-show. Objectif : tenir le SMS en un seul
 * segment (70 chars UCS-2 avec accents) — l'URL `https://rdv.neuracorp.ai/c/
 * XXXXXXXXXX` fait ~34 caractères, à comparer aux 83 chars de l'ancien
 * `/confirm/{tokenHMAC}`.
 *
 * Fonctionnement :
 *   - Le shortCode (10 chars base64url) est généré à l'init du RDV et stocké
 *     dans AppointmentConfirmation à côté du token HMAC.
 *   - Cette route résout côté serveur `shortCode → token`, puis délègue le
 *     rendu au composant partagé `AppointmentConfirmForm`. Le formulaire
 *     appelle ensuite les mêmes API `/api/rdv/{token}/…` que la page longue,
 *     donc pas de duplication de logique métier (identité, verrouillage,
 *     expiration, etc.).
 *
 * Server component : le lookup se fait avant le rendu, aucun round-trip
 * client. Si le shortCode n'existe pas ou est expiré, on renvoie une 404
 * standard Next.js (better UX que rendre le formulaire avec une erreur).
 */

// La table AppointmentConfirmation change à chaque appel — on force le
// rendu dynamique pour éviter que Next.js essaye de statically render cette
// page au build.
export const dynamic = "force-dynamic";

export default async function ConfirmAppointmentByShortCodePage({
  params,
}: {
  params: { shortCode: string };
}) {
  const shortCode = params.shortCode;
  if (!shortCode || shortCode.length < 4 || shortCode.length > 32) {
    notFound();
  }

  const res = await db.query<{ token: string }>(
    `SELECT "token" FROM "AppointmentConfirmation"
      WHERE "shortCode" = $1
      LIMIT 1`,
    [shortCode]
  );
  if (res.rowCount === 0 || !res.rows[0]?.token) {
    notFound();
  }

  return <AppointmentConfirmForm token={res.rows[0].token} />;
}

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PrescriptionUploadForm from "./PrescriptionUploadForm";

/**
 * URL courte du SMS de depot d'ordonnance patient.
 * Servi sur le sous-domaine depot-ordonnances.neuracorp.ai (isole par le
 * middleware — seules /d/[shortCode] et /api/prescriptions/[token]/* sont
 * accessibles sur ce host).
 *
 * Fonctionnement :
 *   - Le shortCode (10 chars base64url) est genere par POST /api/prescriptions/init
 *     et stocke dans PrescriptionUpload a cote du token HMAC.
 *   - Cette route resout cote serveur `shortCode -> token`, puis passe le
 *     token au client component qui gere le formulaire d'upload + saisie
 *     du verificationCode.
 *   - Si le shortCode n'existe pas -> notFound() qui rend not-found.tsx
 *     (evite de reveler l'existence ou non d'un shortCode donne).
 *
 * Quirk Next.js 14 App Router : avec `dynamic = "force-dynamic"`, notFound()
 * rend correctement not-found.tsx (le body contient `digest:NEXT_NOT_FOUND`)
 * mais garde le status HTTP a 200 au lieu de 404, car les headers partent en
 * streaming avant que notFound() ne soit throw. Impact : uptime monitors qui
 * checkent le code HTTP ne detecteront pas la 404 (fallback : grep du body
 * "Lien invalide" est fiable). Fixe upstream dans Next.js 15+.
 */

// La table PrescriptionUpload change constamment (uploads, ack, expirations,
// nouveaux inits), donc rendu dynamique force.
export const dynamic = "force-dynamic";

export default async function PrescriptionUploadByShortCodePage({
  params,
}: {
  params: { shortCode: string };
}) {
  const shortCode = params.shortCode;
  if (!shortCode || shortCode.length < 4 || shortCode.length > 32) {
    notFound();
  }

  const res = await db.query<{ token: string }>(
    `SELECT "token" FROM "PrescriptionUpload"
      WHERE "shortCode" = $1
      LIMIT 1`,
    [shortCode]
  );
  if (res.rowCount === 0 || !res.rows[0]?.token) {
    notFound();
  }

  return <PrescriptionUploadForm token={res.rows[0].token} />;
}

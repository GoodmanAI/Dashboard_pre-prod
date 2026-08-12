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

const DEPOT_BASE_URL =
  process.env.DEPOT_ORDONNANCES_URL_BASE ||
  "https://depot-ordonnances.neuracorp.ai";

/**
 * Metadonnees du lien patient. Meme raison que pour /c/[shortCode] (voir le
 * commentaire detaille la-bas) : les applications de messagerie pre-chargent
 * l'URL du SMS pour en faire un apercu, et sans titre ni Open Graph cet apercu
 * est un rectangle vide sous un lien d'allure suspecte.
 *
 * `noindex` est encore plus important ici : la page mene au depot d'un document
 * medical. Elle n'a rien a faire dans un index de moteur de recherche.
 */
export const metadata = {
  title: "Dépôt de votre ordonnance",
  description:
    "Transmettez votre ordonnance à votre centre d'imagerie avant votre examen. Aucun paiement n'est demandé.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Dépôt de votre ordonnance",
    description:
      "Transmettez votre ordonnance à votre centre d'imagerie avant votre examen. Aucun paiement n'est demandé.",
    type: "website" as const,
    locale: "fr_FR",
    siteName: "Neuracorp",
    images: [
      {
        url: `${DEPOT_BASE_URL}/images/logos/neuracorp-ai-icon_fond.png`,
        width: 512,
        height: 512,
        alt: "Neuracorp",
      },
    ],
  },
};

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

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { lienOuvert } from "@/lib/prescriptionDocuments";
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
 *   - Si le shortCode n'existe pas, ou si l'heure du RDV est passee ->
 *     notFound() qui rend not-found.tsx (evite de reveler l'existence ou non
 *     d'un shortCode donne). Un lien echu n'est plus consultable : le
 *     patient peut y deposer plusieurs documents, en plusieurs fois, jusqu'a
 *     l'heure du RDV, pas apres.
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
export async function generateMetadata({ params }: { params: { shortCode: string } }) {
  // Nom du centre (28/11/2026) : il est déjà en clair dans le SMS, et il rend le lien
  // reconnaissable. Best-effort, un échec ne doit jamais empêcher la page de s'afficher.
  let centre: string | null = null;
  try {
    const r = await db.query<{ nom: string | null }>(
      `SELECT u."name" AS "nom"
         FROM "PrescriptionUpload" p JOIN "User" u ON u."id" = p."centerId"
        WHERE p."shortCode" = $1 LIMIT 1`,
      [params.shortCode]
    );
    centre = r.rows[0]?.nom ?? null;
  } catch {
    centre = null;
  }
  const description = centre
    ? `Transmettez votre ordonnance à ${centre} avant votre examen. Aucun paiement n'est demandé.`
    : "Transmettez votre ordonnance à votre centre d'imagerie avant votre examen. Aucun paiement n'est demandé.";
  return {
    title: "Dépôt de votre ordonnance",
    description,
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title: "Dépôt de votre ordonnance",
      description,
      type: "website" as const,
      locale: "fr_FR",
      siteName: centre ?? "Neuracorp",
      // Logo du centre (`./logo/route.ts`), sinon celui de Neuracorp par redirection.
      images: [
        {
          url: `${DEPOT_BASE_URL}/d/${encodeURIComponent(params.shortCode)}/logo`,
          alt: centre ?? "Neuracorp",
        },
      ],
    },
  };
}

export default async function PrescriptionUploadByShortCodePage({
  params,
}: {
  params: { shortCode: string };
}) {
  const shortCode = params.shortCode;
  if (!shortCode || shortCode.length < 4 || shortCode.length > 32) {
    notFound();
  }

  const res = await db.query<{
    token: string;
    status: string;
    expiresAt: Date;
  }>(
    `SELECT "token", "status", "expiresAt" FROM "PrescriptionUpload"
      WHERE "shortCode" = $1
      LIMIT 1`,
    [shortCode]
  );
  const lien = res.rows[0];
  // LOCKED reste affiche (le formulaire explique le verrouillage) ; seul le
  // lien echu disparait.
  if (
    !lien?.token ||
    (lien.status !== "LOCKED" && !lienOuvert(lien.status, lien.expiresAt))
  ) {
    notFound();
  }

  return <PrescriptionUploadForm token={lien.token} />;
}

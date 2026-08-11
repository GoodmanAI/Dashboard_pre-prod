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

const RDV_BASE_URL = process.env.RDV_SHORT_URL_BASE || "https://rdv.neuracorp.ai";
const OG_IMAGE = `${RDV_BASE_URL}/images/logos/neuracorp-ai-icon_fond.png`;

/**
 * Métadonnées de la page — elles ne servent PAS le référencement, mais l'aperçu
 * du lien dans l'application de messagerie du patient.
 *
 * Constat du 2026-08-11 : les applications Messages (`Dalvik/…`,
 * `GoogleMessages/…` dans les logs nginx) pré-chargent systématiquement l'URL du
 * SMS pour afficher une carte d'aperçu. Sans balise `<title>` ni Open Graph,
 * cette carte est un rectangle VIDE sous un lien à l'allure de phishing — ce que
 * plusieurs patients ont rapporté à leur centre comme « une page blanche ».
 * Le layout racine étant `"use client"`, il ne peut pas exporter de metadata :
 * c'est donc ici, dans le server component, que ça se joue.
 *
 * `robots: noindex/nofollow` : Googlebot (66.249.x) a visité cinq liens patients
 * le 2026-08-11 sans rien pour l'en empêcher. Ces pages exposent la date d'un
 * rendez-vous médical — elles n'ont pas à être explorées ni indexées.
 *
 * Ne jamais mettre la date du rendez-vous ni l'identité du patient ici : le
 * titre et la description transitent par les serveurs de l'opérateur de
 * messagerie pour générer l'aperçu. Le nom du centre, lui, figure déjà en clair
 * dans le SMS — et c'est justement lui qui rend le lien reconnaissable.
 */
export async function generateMetadata({
  params,
}: {
  params: { shortCode: string };
}) {
  let centre: string | null = null;

  // Best-effort : un échec ici ne doit jamais empêcher la page de s'afficher.
  try {
    const res = await db.query<{ centerName: string | null }>(
      `SELECT u."name" AS "centerName"
         FROM "AppointmentConfirmation" a
         JOIN "User" u ON u."id" = a."centerId"
        WHERE a."shortCode" = $1
        LIMIT 1`,
      [params.shortCode]
    );
    centre = res.rows[0]?.centerName ?? null;
  } catch {
    centre = null;
  }

  const title = centre
    ? `Confirmation de rendez-vous — ${centre}`
    : "Confirmation de rendez-vous";
  const description = centre
    ? `Confirmez ou annulez votre rendez-vous d'imagerie médicale auprès de ${centre}. Aucun paiement n'est demandé.`
    : "Confirmez ou annulez votre rendez-vous d'imagerie médicale. Aucun paiement n'est demandé.";

  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title,
      description,
      type: "website" as const,
      locale: "fr_FR",
      siteName: "Neuracorp",
      images: [{ url: OG_IMAGE, width: 512, height: 512, alt: "Neuracorp" }],
    },
  };
}

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

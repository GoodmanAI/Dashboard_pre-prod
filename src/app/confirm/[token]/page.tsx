import AppointmentConfirmForm from "../AppointmentConfirmForm";

/**
 * Page rétrocompat : URL longue historique avec le token HMAC directement dans
 * l'URL (~83 caractères). Les vieux SMS envoyés avant le déploiement du
 * shortCode continuent d'atterrir ici. Nouveaux SMS : utilisent l'URL courte
 * `/c/{shortCode}` (voir src/app/c/[shortCode]/page.tsx).
 */
const RDV_BASE_URL = process.env.RDV_SHORT_URL_BASE || "https://rdv.neuracorp.ai";

/**
 * Mêmes métadonnées que `/c/[shortCode]`, en version générique : cette page ne
 * reçoit qu'un token opaque, et faire une requête pour retrouver le centre ne se
 * justifie pas sur une route de rétrocompatibilité.
 *
 * L'essentiel y est : un titre pour que l'aperçu du lien dans l'application de
 * messagerie ne soit pas un rectangle vide, et `noindex` pour que Googlebot
 * n'explore pas une page portant la date d'un rendez-vous médical.
 * Voir `/c/[shortCode]/page.tsx` pour le détail du constat.
 */
export const metadata = {
  title: "Confirmation de rendez-vous",
  description:
    "Confirmez ou annulez votre rendez-vous d'imagerie médicale. Aucun paiement n'est demandé.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Confirmation de rendez-vous",
    description:
      "Confirmez ou annulez votre rendez-vous d'imagerie médicale. Aucun paiement n'est demandé.",
    type: "website" as const,
    locale: "fr_FR",
    siteName: "Neuracorp",
    images: [
      {
        url: `${RDV_BASE_URL}/images/logos/neuracorp-ai-icon_fond.png`,
        width: 512,
        height: 512,
        alt: "Neuracorp",
      },
    ],
  },
};

export default function ConfirmAppointmentByTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return <AppointmentConfirmForm token={params.token} />;
}

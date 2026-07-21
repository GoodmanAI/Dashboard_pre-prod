import AppointmentConfirmForm from "../AppointmentConfirmForm";

/**
 * Page rétrocompat : URL longue historique avec le token HMAC directement dans
 * l'URL (~83 caractères). Les vieux SMS envoyés avant le déploiement du
 * shortCode continuent d'atterrir ici. Nouveaux SMS : utilisent l'URL courte
 * `/c/{shortCode}` (voir src/app/c/[shortCode]/page.tsx).
 */
export default function ConfirmAppointmentByTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return <AppointmentConfirmForm token={params.token} />;
}

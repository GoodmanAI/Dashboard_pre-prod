import type { Prisma } from "@prisma/client";

/**
 * Les notifications que Pilot envoie dans la cloche commune au Dashboard et à
 * Pilot (table `Notification`, plan 2026-11-pilot-dans-le-dashboard, lot P6).
 *
 * Trois causes : une demande reçue, un commentaire reçu, une alerte confiée.
 * Écrites dans la même transaction que ce qui les cause : pas de notification
 * pour une demande annulée par une erreur. La clé (`cle`) est unique par
 * destinataire : rejouer la même écriture ne notifie pas deux fois.
 *
 * Le message ne porte jamais le texte d'un commentaire ni d'une précision : le
 * nom du client et la nature de la chose, rien d'autre (C-22, C-27).
 */
export type TypeNotificationPilot = "pilot.demande" | "pilot.commentaire" | "pilot.alerte";

export type NotificationPilot = {
  userId: number;
  type: TypeNotificationPilot;
  message: string;
  lien: string;
  cle: string;
};

const LONGUEUR_MESSAGE = 240;

export async function notifier(tx: Prisma.TransactionClient, notifications: NotificationPilot[]): Promise<void> {
  if (!notifications.length) return;
  await tx.notification.createMany({
    data: notifications.map((n) => ({ ...n, message: n.message.slice(0, LONGUEUR_MESSAGE) })),
    skipDuplicates: true,
  });
}

/**
 * La cloche se relit tout de suite à l'écoute de cet événement (le même que les
 * tickets). Sans socket (scripts, tests), elle se relit d'elle-même dans la minute.
 */
export function prevenirLesCloches(): void {
  const io = (globalThis as { io?: { emit: (evenement: string, charge: unknown) => void } }).io;
  try { io?.emit("ticket-updated", { source: "pilot" }); } catch { /* la cloche se relit seule */ }
}

export const lienFiche = (organisationId: number) => `/pilot/organisations/${organisationId}`;

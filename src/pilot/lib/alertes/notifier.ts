import { prisma } from "@/pilot/lib/prisma";
import { notifier, prevenirLesCloches, type NotificationPilot } from "@/pilot/lib/notifications";
import { calculerAlertesDuParc } from "./index";
import type { Alerte } from "./types";

/**
 * Les alertes actives du parc, poussées dans la cloche commune de la personne qui
 * doit agir (C-91 : celle à qui l'alerte est confiée, sinon le directeur général,
 * sinon le super-administrateur). Appelé par le passage régulier
 * (`scripts/pilot/evaluer-parc.ts`, toutes les 15 minutes).
 *
 * Une alerte ne repart pas à chaque passage : la clé est celle de sa cause
 * (`Alerte.cle`, stable et unique, guide d'intégration §5), unique par destinataire.
 */
export function notificationsDesAlertes(actives: readonly Alerte[]): NotificationPilot[] {
  const sortie: NotificationPilot[] = [];
  for (const a of actives) {
    const userId = a.attribution?.userId;
    if (!userId) continue;
    sortie.push({
      userId, type: "pilot.alerte", lien: a.lien.startsWith("/") ? a.lien : `/pilot/organisations/${a.organisationId}`,
      cle: `alerte-${a.cle}`, message: `${a.niveau === "bloquant" ? "Alerte bloquante" : "Alerte"} : ${a.titre}, ${a.organisationNom}.`,
    });
  }
  return sortie;
}

export async function notifierAlertesDuParc(maintenant = new Date()): Promise<{ alertes: number; notifiees: number }> {
  const { actives } = await calculerAlertesDuParc({ maintenant });
  const notifications = notificationsDesAlertes(actives);
  const avant = await prisma.notification.count({ where: { type: "pilot.alerte" } });
  await prisma.$transaction((tx) => notifier(tx, notifications));
  const apres = await prisma.notification.count({ where: { type: "pilot.alerte" } });
  if (apres > avant) prevenirLesCloches();
  return { alertes: actives.length, notifiees: apres - avant };
}

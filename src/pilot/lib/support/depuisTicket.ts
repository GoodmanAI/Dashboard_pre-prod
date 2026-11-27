import { prisma } from "@/pilot/lib/prisma";

/**
 * Ce que Pilot lit d'une demande de client (ticket du Dashboard) pour ouvrir le sujet de
 * l'équipe qui en discute (27/11/2026, décision d'Enzo, plan
 * lyrae/plans/2026-11-separation-dashboard-pilot.md, lot L6) : son titre, et la fiche du
 * client à qui elle appartient. Jamais le texte du client ni ses messages : ils restent
 * dans le ticket, que l'écran lit par l'API du Dashboard.
 *
 * La fiche se retrouve par le compte du centre (`userProductId` du ticket rattaché à un
 * centre de Pilot), sinon par le compte principal du client (le sous-compte qui écrit
 * remonte à son principal).
 */
export type ContexteTicket = {
  ticketId: number;
  titre: string;
  organisationId: number | null;
  sujetId: number | null;
};

export async function contexteTicket(ticketId: number): Promise<ContexteTicket | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, userProductId: true, user: { select: { id: true, managerId: true } }, sujetEquipe: { select: { id: true } } },
  });
  if (!ticket) return null;
  let organisationId: number | null = null;
  if (ticket.userProductId) {
    const rattache = await prisma.crmCentreProduit.findFirst({ where: { userProductId: ticket.userProductId }, select: { centre: { select: { organisationId: true } } } });
    organisationId = rattache?.centre.organisationId ?? null;
  }
  if (organisationId === null) {
    const principal = ticket.user.managerId ?? ticket.user.id;
    const fiche = await prisma.crmOrganisation.findFirst({ where: { utilisateurId: principal }, select: { id: true } });
    organisationId = fiche?.id ?? null;
  }
  return { ticketId: ticket.id, titre: ticket.subject.slice(0, 160), organisationId, sujetId: ticket.sujetEquipe?.id ?? null };
}

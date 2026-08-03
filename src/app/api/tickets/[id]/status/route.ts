export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import { notifyTicketClosedToClient } from "@/lib/ticketNotifications";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * POST /api/tickets/[id]/status
 *
 * Change le status d'un ticket. Reserve aux ADMIN globaux (role=ADMIN).
 * (Les CLIENT ne changent pas le status directement — ils repondent, et
 * un message client sur un ticket RESOLVED re-ouvre implicitement en
 * IN_PROGRESS, voir POST /messages.)
 *
 * Transitions autorisees :
 *   PENDING     -> IN_PROGRESS | RESOLVED | CLOSED
 *   IN_PROGRESS -> RESOLVED    | CLOSED
 *   RESOLVED    -> IN_PROGRESS | CLOSED     (re-ouverture manuelle possible)
 *   CLOSED      -> PENDING                  (re-ouverture apres archive)
 *
 * Champs auto :
 *   - RESOLVED       : set resolvedAt = NOW()
 *   - CLOSED         : set closedAt   = NOW() (garde resolvedAt s'il existe)
 *   - IN_PROGRESS    : clear resolvedAt et closedAt si pertinent
 *   - assignedToId   : set automatique a l'admin qui prend en charge
 *                      (PENDING -> IN_PROGRESS transition)
 *
 * Notifications :
 *   - Email au client (via Brevo) : uniquement pour RESOLVED et CLOSED
 *   - Notification in-app         : pour toute transition
 *
 * Body : { status: "PENDING"|"IN_PROGRESS"|"RESOLVED"|"CLOSED", note?: string }
 */

const StatusUpdateSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  /** Note optionnelle affichee au client dans le mail de resolution/cloture */
  note: z.string().max(2000).optional(),
});

// Toute transition entre 2 statuts differents est autorisee. La logique
// metier "attendue" est PENDING -> IN_PROGRESS -> RESOLVED -> CLOSED, mais
// on garde tous les chemins ouverts pour ne pas bloquer un admin qui doit
// corriger un statut mis a jour par erreur, ou reouvrir un ticket ferme.
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["PENDING", "RESOLVED", "CLOSED"],
  RESOLVED: ["PENDING", "IN_PROGRESS", "CLOSED"],
  CLOSED: ["PENDING", "IN_PROGRESS", "RESOLVED"],
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Accès refusé : ADMIN requis" },
      { status: 403 }
    );
  }
  const sessionUserId = Number(session.user.id);

  const ticketId = parseInt(params.id, 10);
  if (!Number.isFinite(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  let bodyJson: any;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = StatusUpdateSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.errors },
      { status: 400 }
    );
  }
  const { status: newStatus, note } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    // contactEmail est en priorite si defini (voir migration
    // add_ticket_contact_email). Sinon on retombe sur user.email.
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Verif transition autorisee
  const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
  if (ticket.status === newStatus) {
    return NextResponse.json({ error: "Status inchangé" }, { status: 400 });
  }
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Transition ${ticket.status} -> ${newStatus} non autorisee`,
        allowedTransitions: allowed,
      },
      { status: 400 }
    );
  }

  // Update DB
  const updateData: Record<string, any> = { status: newStatus };
  if (newStatus === "IN_PROGRESS") {
    // Prend en charge par l'admin qui fait la transition
    if (!ticket.assignedToId) {
      updateData.assignedToId = sessionUserId;
    }
    updateData.resolvedAt = null;
    updateData.closedAt = null;
  } else if (newStatus === "RESOLVED") {
    updateData.resolvedAt = new Date();
    updateData.closedAt = null;
    if (!ticket.assignedToId) {
      updateData.assignedToId = sessionUserId;
    }
  } else if (newStatus === "CLOSED") {
    updateData.closedAt = new Date();
    // On garde resolvedAt s'il existait
  } else if (newStatus === "PENDING") {
    // Re-ouverture apres CLOSED : reset assignedTo pour permettre a un
    // autre admin de reprendre
    updateData.assignedToId = null;
    updateData.resolvedAt = null;
    updateData.closedAt = null;
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
  });

  // Notif in-app au proprietaire du ticket
  try {
    let notifMsg: string;
    switch (newStatus) {
      case "IN_PROGRESS":
        notifMsg = `Votre ticket "${ticket.subject}" est pris en charge par le support.`;
        break;
      case "RESOLVED":
        notifMsg = `Votre ticket "${ticket.subject}" a ete marque comme resolu.`;
        break;
      case "CLOSED":
        notifMsg = `Votre ticket "${ticket.subject}" a ete ferme.`;
        break;
      case "PENDING":
        notifMsg = `Votre ticket "${ticket.subject}" a ete re-ouvert.`;
        break;
      default:
        notifMsg = `Votre ticket "${ticket.subject}" a change de statut.`;
    }
    await prisma.notification.create({
      data: {
        ticketId,
        userId: ticket.userId,
        message: notifMsg,
      },
    });
  } catch (err) {
    console.error(
      "[POST /api/tickets/[id]/status] notif in-app failed (non-bloquant):",
      err
    );
  }

  // Diffusion websocket pour rafraichir instantanement les pages ouvertes
  const io: any = globalThis.io;
  if (io) {
    io.emit("ticket-updated", { ticketId, kind: "status" });
  }

  // Notif email au client uniquement pour RESOLVED et CLOSED.
  // On envoie sur contactEmail (dedie ticket) en priorite, fallback sur
  // user.email si absent (tickets historiques ou compte avec mail unique).
  if (newStatus === "RESOLVED" || newStatus === "CLOSED") {
    const recipientEmail = ticket.contactEmail ?? ticket.user.email;
    notifyTicketClosedToClient({
      ticketId: ticket.id,
      subject: ticket.subject,
      newStatus,
      clientEmail: recipientEmail,
      clientName: ticket.user.name,
      resolvedByName: session.user.name ?? null,
      resolutionNote: note ?? null,
    }).catch((err) =>
      console.error(
        "[POST /api/tickets/[id]/status] notif email client failed (non-bloquant):",
        err
      )
    );
  }

  auditLog("ticket", "status-change", {
    actor: {
      id: sessionUserId,
      email: session.user.email ?? null,
      role: session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "ticket", id: ticketId, label: ticket.subject },
    metadata: {
      fromStatus: ticket.status,
      toStatus: newStatus,
      hasNote: !!note,
      clientUserId: ticket.userId,
    },
  });

  return NextResponse.json({ ticket: updated }, { status: 200 });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";

/**
 * POST /api/tickets/[id]/messages
 *
 * Ajoute un message au thread d'un ticket (chat client <-> admin).
 *
 * Auth : session NextAuth. L'appelant doit etre :
 *   - le proprietaire du ticket (userId), OU
 *   - le createur (createdById), OU
 *   - un ADMIN_USER manager du proprietaire, OU
 *   - un ADMIN global (role=ADMIN)
 *
 * Regle metier : on ne peut pas ajouter de message si le ticket est CLOSED
 * (archive). Pour reprendre la conversation, il faut d'abord rouvrir
 * (transition CLOSED -> PENDING via /api/tickets/[id]/status par un admin).
 * Sur un ticket RESOLVED, un nouveau message du client re-ouvre implicitement
 * le ticket (repasse en IN_PROGRESS pour signaler au support qu'il y a du
 * feedback client).
 *
 * Notifications :
 *   - In-app : notification pour l'"autre partie" (si client ecrit, admin
 *     receoit notif ; si admin ecrit, client receoit notif)
 *   - Email : PAS de mail par nouveau message (choix produit pour eviter le
 *     spam). Le user voit les nouveaux messages dans le dashboard.
 *
 * Body : { body: string min 1 max 10000 }
 * Reponse 201 : { message: {...} }
 */

const MessageCreateSchema = z.object({
  body: z.string().min(1).max(10000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUserId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";

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
  const parsed = MessageCreateSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.errors },
      { status: 400 }
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      userId: true,
      createdById: true,
      status: true,
      subject: true,
      user: { select: { managerId: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Ticket CLOSED = archive : plus de messages
  if (ticket.status === "CLOSED") {
    return NextResponse.json(
      { error: "Ticket ferme, impossible d'ajouter un message" },
      { status: 409 }
    );
  }

  // Controle d'acces
  const isOwner = ticket.userId === sessionUserId;
  const isCreator = ticket.createdById === sessionUserId;
  let isManager = false;
  if (!isOwner && !isCreator && !isAdmin) {
    if (ticket.user?.managerId === sessionUserId) {
      const current = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { centreRole: true },
      });
      if (current?.centreRole === "ADMIN_USER") isManager = true;
    }
  }
  if (!isOwner && !isCreator && !isManager && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const authorIsAdmin = isAdmin;

  // Transaction : creer le message + eventuellement re-ouvrir un ticket
  // RESOLVED si le message vient du CLIENT (le client conteste la resolution).
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: {
        ticketId,
        authorId: sessionUserId,
        body: parsed.data.body,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // Si un CLIENT ecrit sur un ticket RESOLVED -> le remettre en IN_PROGRESS
    // (le support doit re-traiter). Un ADMIN qui ecrit sur RESOLVED ne change
    // pas le status (il peut re-fermer manuellement si besoin).
    if (ticket.status === "RESOLVED" && !authorIsAdmin) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: "IN_PROGRESS", resolvedAt: null },
      });
    }

    return message;
  });

  // Notification in-app pour l'autre partie
  try {
    if (authorIsAdmin) {
      // Notif au client (owner)
      await prisma.notification.create({
        data: {
          ticketId,
          userId: ticket.userId,
          message: `Nouvelle reponse du support sur votre ticket : ${ticket.subject}`,
        },
      });
    } else {
      // Notif a tous les ADMIN
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            ticketId,
            userId: a.id,
            message: `Nouveau message client sur le ticket #${ticketId} : ${ticket.subject}`,
          })),
        });
      }
    }
  } catch (err) {
    console.error(
      "[POST /api/tickets/[id]/messages] notif in-app failed (non-bloquant):",
      err
    );
  }

  // Diffusion websocket : notifie tous les clients (les 2 parties dans un
  // navigateur ouvert sur la page detail) pour un refresh instantane du
  // thread sans polling.
  const io: any = globalThis.io;
  if (io) {
    io.emit("ticket-updated", { ticketId, kind: "message" });
  }

  return NextResponse.json({ message: result }, { status: 201 });
}

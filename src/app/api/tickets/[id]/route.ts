export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * GET /api/tickets/[id]
 *
 * Retourne le detail complet d'un ticket + le thread de messages associe.
 *
 * Auth : session NextAuth. Le user doit etre :
 *   - le proprietaire du ticket (userId), OU
 *   - le createur du ticket (createdById), OU
 *   - un ADMIN_USER manager du proprietaire, OU
 *   - un ADMIN global (role=ADMIN)
 *
 * Sinon : 403.
 *
 * Reponse 200 :
 *   { ticket: { ...fields..., messages: [...], user, createdBy, assignedTo, userProduct } }
 */

export async function GET(
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

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      userProduct: {
        select: {
          id: true,
          product: { select: { name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Controle d'acces
  const isOwner = ticket.userId === sessionUserId;
  const isCreator = ticket.createdById === sessionUserId;

  let isManager = false;
  if (!isOwner && !isCreator && !isAdmin) {
    // Verifier si l'appelant est ADMIN_USER manager du proprietaire
    const owner = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { managerId: true },
    });
    if (owner?.managerId === sessionUserId) {
      const current = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { centreRole: true },
      });
      if (current?.centreRole === "ADMIN_USER") {
        isManager = true;
      }
    }
  }

  if (!isOwner && !isCreator && !isManager && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // displayNumber = position chronologique du ticket parmi ceux du proprio.
  // Cote client : le 1er ticket cree = #1, meme si son id global vaut 42.
  // Cote admin : on renvoie aussi mais le frontend l'ignore (utilise id).
  const displayNumber = await prisma.ticket.count({
    where: {
      userId: ticket.userId,
      createdAt: { lte: ticket.createdAt },
    },
  });

  return NextResponse.json(
    { ticket: { ...ticket, displayNumber } },
    { status: 200 }
  );
}

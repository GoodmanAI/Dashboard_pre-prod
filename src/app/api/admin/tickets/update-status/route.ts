import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";

const UpdateTicketStatusSchema = z.object({
  ticketId: z.number().int().positive(),
  status: z.enum(["PENDING", "IN_PROGRESS", "CLOSED"]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession({ req: request, ...authOptions });
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can update ticket status." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = UpdateTicketStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { ticketId, status } = parseResult.data;

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const notificationMessage = `Votre ticket "${updatedTicket.subject}" a été mis à jour au statut "${status}".`;
    await prisma.notification.create({
      data: {
        ticketId: updatedTicket.id,
        userId: updatedTicket.userId,
        message: notificationMessage,
      },
    });

    return NextResponse.json(
      { message: "Ticket status updated successfully", ticket: updatedTicket },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    );
  }
}

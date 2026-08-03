export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import { notifyNewTicketToAdmin } from "@/lib/ticketNotifications";

/**
 * API Tickets (centre-aware, refonte chantier 2)
 * -----------------------------------------------------------------------------
 * GET  /api/tickets          -> liste des tickets du user effectif
 * POST /api/tickets          -> creation ticket (+ notif email admin + notif in-app)
 *
 * Le detail par ticket (GET/POST) est dans /api/tickets/[id]/*.
 *
 * Impersonation via ?asUserId= :
 *   - Reserve aux comptes centreRole=ADMIN_USER pour un centre qu'ils
 *     managent (managerId === session.user.id)
 *   - Le createdById reste session.user.id (tracabilite), le userId cible
 *     devient asUserId
 *
 * Scope centre :
 *   - Le body POST peut inclure userProductId pour attacher le ticket a un
 *     centre precis (multi-centre). Le UserProduct doit appartenir au user
 *     cible (verification cote endpoint).
 *   - userProductId est optionnel : si absent, le ticket est global au client.
 *
 * Auth : session NextAuth requise. POST reserve aux CLIENT (les ADMIN
 * globaux ne creent pas de tickets, ils repondent aux tickets existants).
 */

/**
 * Resout le userId effectif a utiliser pour l'operation (centre-aware).
 * Par defaut : session.user.id. Avec ?asUserId=X : necessite ADMIN_USER +
 * relation manager -> centre valide.
 */
async function resolveEffectiveUserId(
  sessionUserId: number,
  request: NextRequest
): Promise<number> {
  const { searchParams } = request.nextUrl;
  const asUserIdParam = searchParams.get("asUserId");
  if (!asUserIdParam) return sessionUserId;

  const asUserId = Number(asUserIdParam);
  if (!Number.isFinite(asUserId)) {
    throw { status: 400, msg: "Invalid asUserId" };
  }
  if (asUserId === sessionUserId) return sessionUserId;

  const current = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { centreRole: true },
  });
  if (current?.centreRole !== "ADMIN_USER") {
    throw { status: 403, msg: "Forbidden : centreRole ADMIN_USER requis" };
  }
  const managed = await prisma.user.findFirst({
    where: { id: asUserId, managerId: sessionUserId },
    select: { id: true },
  });
  if (!managed) {
    throw { status: 403, msg: "Not managed by this admin" };
  }
  return asUserId;
}

// ============================================================================
// GET /api/tickets
// ============================================================================
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUserId = Number(session.user.id);
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  try {
    const effectiveUserId = await resolveEffectiveUserId(sessionUserId, request);
    const tickets = await prisma.ticket.findMany({
      where: { userId: effectiveUserId },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        userProductId: true,
        assignedToId: true,
        createdBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        // Compteur de messages pour badge "N nouveaux" (pas encore la logique
        // read-tracking, mais expose le total pour UI simple)
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tickets }, { status: 200 });
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.msg }, { status: e.status });
    console.error("GET /api/tickets error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/tickets
// ============================================================================
const TicketCreateSchema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(3).max(10000),
  /** Optionnel : id du UserProduct concerne. Doit appartenir au user cible. */
  userProductId: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      {
        error:
          "Accès refusé. Seuls les comptes clients peuvent créer des tickets.",
      },
      { status: 403 }
    );
  }
  const sessionUserId = Number(session.user.id);
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: "ID utilisateur invalide" }, { status: 400 });
  }

  try {
    const effectiveUserId = await resolveEffectiveUserId(sessionUserId, request);

    const body = await request.json();
    const parsed = TicketCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Échec de la validation", details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { subject, message, userProductId } = parsed.data;

    // Verif : le userProductId (s'il est fourni) doit bien appartenir au
    // user cible (empeche un ADMIN_USER d'attacher un ticket a un centre
    // d'un autre client).
    if (userProductId) {
      const up = await prisma.userProduct.findFirst({
        where: { id: userProductId, userId: effectiveUserId },
        select: { id: true },
      });
      if (!up) {
        return NextResponse.json(
          { error: "userProductId invalide ou non associé au client" },
          { status: 400 }
        );
      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: effectiveUserId,
        createdById: sessionUserId,
        userProductId: userProductId ?? null,
        subject,
        message,
      },
      include: {
        user: { select: { name: true, email: true } },
        userProduct: {
          select: {
            id: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    // Notification in-app : tous les ADMIN globaux recoivent une notif
    // (pas juste le premier — pattern audit "diffusion plus robuste").
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (admins.length > 0) {
      const actor = session.user.name ?? session.user.email ?? "Client";
      const notifMsg =
        effectiveUserId === sessionUserId
          ? `Nouveau ticket de ${actor} : ${subject}`
          : `Nouveau ticket cree par ${actor} pour le client #${effectiveUserId} : ${subject}`;
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          ticketId: ticket.id,
          userId: a.id,
          message: notifMsg,
        })),
      });
    }

    // Diffusion websocket : notifie les clients Grafana connectes (les
    // admins ouverts sur une page dashboard) pour que la cloche
    // NotificationBell refresh instantanement sans attendre le poll 60s.
    const io: any = globalThis.io;
    if (io) {
      io.emit("ticket-updated", { ticketId: ticket.id, kind: "created" });
    }

    // Notification email a l'admin support (SUPPORT_ADMIN_EMAIL). Fire and
    // forget : on ne bloque pas la reponse HTTP si l'email echoue.
    notifyNewTicketToAdmin({
      ticketId: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      clientEmail: ticket.user.email,
      clientName: ticket.user.name,
      createdByEmail:
        session.user.email ?? ticket.user.email,
      createdByName:
        session.user.name ?? ticket.user.name,
      userProductLabel: ticket.userProduct
        ? `#${ticket.userProduct.id} — ${ticket.userProduct.product.name}`
        : null,
    }).catch((err) =>
      console.error(
        "[POST /api/tickets] notif email admin failed (non-bloquant):",
        err
      )
    );

    return NextResponse.json(
      { message: "Ticket créé avec succès", ticket: { id: ticket.id } },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.msg }, { status: e.status });
    console.error("POST /api/tickets error:", e);
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/tickets
 *
 * Liste tous les tickets pour un ADMIN global (role=ADMIN).
 *
 * Query params (tous optionnels) :
 *   - status       : filtre statut (PENDING|IN_PROGRESS|RESOLVED|CLOSED, CSV possible)
 *   - q            : recherche texte dans subject + message
 *   - assignedToMe : "1" pour ne voir que les tickets assignes a l'admin appelant
 *   - unassigned   : "1" pour ne voir que les tickets non assignes
 *   - userProductId: filtre centre
 *   - limit        : max 500, defaut 200
 *
 * Reponse : { tickets: [...] } — tries par status puis createdAt desc.
 */

export async function GET(request: NextRequest) {
  const session = await getServerSession({ req: request, ...authOptions });
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Access denied. Only admins can access this route." },
      { status: 403 }
    );
  }
  const sessionUserId = Number(session.user.id);

  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const assignedToMe = searchParams.get("assignedToMe") === "1";
  const unassigned = searchParams.get("unassigned") === "1";
  const userProductIdParam = searchParams.get("userProductId");
  const limitParam = searchParams.get("limit");

  const limit = (() => {
    const n = limitParam ? parseInt(limitParam, 10) : 200;
    if (!Number.isFinite(n)) return 200;
    return Math.max(1, Math.min(500, n));
  })();

  const where: Prisma.TicketWhereInput = {};

  if (statusParam) {
    const statuses = statusParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" =>
        ["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(s)
      );
    if (statuses.length > 0) where.status = { in: statuses };
  }
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (assignedToMe) {
    where.assignedToId = sessionUserId;
  } else if (unassigned) {
    where.assignedToId = null;
  }
  if (userProductIdParam) {
    const upid = parseInt(userProductIdParam, 10);
    if (Number.isFinite(upid)) where.userProductId = upid;
  }

  const tickets = await prisma.ticket.findMany({
    where,
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
      _count: { select: { messages: true } },
    },
    // Tri : PENDING d'abord, puis IN_PROGRESS, puis RESOLVED, puis CLOSED
    // (Prisma ne supporte pas orderBy sur enum custom -> tri cote client
    // dans la UI. On tri ici par createdAt desc, la UI fait le split.)
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ tickets }, { status: 200 });
}

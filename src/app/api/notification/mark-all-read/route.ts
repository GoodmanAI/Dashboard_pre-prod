export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * POST /api/notification/mark-all-read
 *
 * Marque comme lues toutes les notifications non lues de l'utilisateur
 * effectif (support impersonation `?asUserId=` pour ADMIN_USER manager,
 * meme regle que get-unread).
 *
 * Utilise par le NotificationBell du header quand l'utilisateur clique
 * sur "Tout marquer comme lu".
 *
 * Reponse 200 : { updated: number }  (nb de notifs affectees)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUserId = Number(session.user.id);
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  // Impersonation (meme pattern que get-unread)
  const { searchParams } = request.nextUrl;
  const asUserIdParam = searchParams.get("asUserId");
  let effectiveUserId = sessionUserId;

  if (asUserIdParam) {
    const asUserId = Number(asUserIdParam);
    if (!Number.isFinite(asUserId)) {
      return NextResponse.json({ error: "Invalid asUserId" }, { status: 400 });
    }
    if (asUserId !== sessionUserId) {
      const current = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { centreRole: true },
      });
      if (current?.centreRole !== "ADMIN_USER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const managed = await prisma.user.findFirst({
        where: { id: asUserId, managerId: sessionUserId },
        select: { id: true },
      });
      if (!managed) {
        return NextResponse.json(
          { error: "Not managed by this admin" },
          { status: 403 }
        );
      }
      effectiveUserId = asUserId;
    }
  }

  // Filtre STRICT sur userId (voir commentaire dans get-unread pour la
  // rationale : eviter les doublons entre destinataires directs et owners
  // de ticket).
  const result = await prisma.notification.updateMany({
    where: {
      isRead: false,
      userId: effectiveUserId,
    },
    data: { isRead: true },
  });

  return NextResponse.json({ updated: result.count }, { status: 200 });
}

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notification/get-unread
 * -----------------------------------------------------------------------------
 * Renvoie la liste des notifications NON LUES pour l'utilisateur cible.
 *
 * Portée & impersonation
 * - Par défaut, l'utilisateur cible est l'utilisateur connecté.
 * - Si le paramètre de requête `?asUserId=` est fourni, l'utilisateur connecté
 *   doit être ADMIN_USER et manager du centre ciblé (contrôle strict).
 *
 * Contenu renvoyé
 * - Notifications non lues liées directement à l'utilisateur (notification.userId)
 *   OU liées à un ticket dont l'utilisateur est le propriétaire (notification.ticket.userId).
 *
 * Codes de réponse
 * - 200: succès avec le tableau `notifications`.
 * - 400: paramètre invalide (ex. asUserId non numérique).
 * - 401: non authentifié.
 * - 403: impersonation non autorisée.
 * - 500: erreur interne.
 */
export async function GET(request: NextRequest) {
  // Contrôle d’accès : nécessite une session valide
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validation de l’identifiant utilisateur de session
  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    // Résolution de l’utilisateur effectif (avec support d’impersonation)
    const { searchParams } = request.nextUrl
    const asUserIdParam = searchParams.get('asUserId')
    let effectiveUserId = sessionUserId

    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam)
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: 'Invalid asUserId' }, { status: 400 })
      }

      // Impersonation : l’utilisateur courant doit être ADMIN_USER
      // et manager du centre ciblé
      if (asUserId !== sessionUserId) {
        const current = await prisma.user.findUnique({
          where: { id: sessionUserId },
          select: { centreRole: true },
        })
        if (current?.centreRole !== 'ADMIN_USER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const managed = await prisma.user.findFirst({
          where: { id: asUserId, managerId: sessionUserId },
          select: { id: true },
        })
        if (!managed) {
          return NextResponse.json({ error: 'Not managed by this admin' }, { status: 403 })
        }

        effectiveUserId = asUserId
      }
    }

    /**
     * Requête des notifications non lues pour l’utilisateur effectif.
     * Inclusion des notifications :
     *  - explicitement adressées à l’utilisateur (notification.userId)
     *  - liées à un ticket dont il est propriétaire (notification.ticket.userId)
     */
    const notifications = await prisma.notification.findMany({
      where: {
        isRead: false,
        OR: [
          { userId: effectiveUserId },
          { ticket: { userId: effectiveUserId } },
        ],
      },
      select: {
        id: true,
        message: true,
        isRead: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            subject: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // tri croissant pour lecture chronologique
    })

    return NextResponse.json({ notifications }, { status: 200 })
  } catch (error) {
    // Journalisation serveur ; ne pas exposer de détails sensibles au client
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

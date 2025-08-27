import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { z } from 'zod'

/**
 * POST /api/notification/mark-read
 * -----------------------------------------------------------------------------
 * Marque une notification comme lue.
 *
 * Sécurité & autorisations
 * - Requiert une session valide.
 * - L’utilisateur doit être le propriétaire de la notification (adressée
 *   directement ou via un ticket dont il est titulaire), ou un ADMIN_USER
 *   gérant au moins un des propriétaires.
 *
 * Corps de requête (JSON)
 * - notificationId: number (obligatoire)
 *
 * Codes de réponse
 * - 200: notification marquée comme lue (idempotent).
 * - 400: charge utile invalide.
 * - 401: non authentifié.
 * - 403: accès interdit (notification non détenue).
 * - 404: notification inexistante.
 * - 500: erreur interne.
 */
const MarkReadSchema = z.object({
  notificationId: z.number(),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 1) Contrôle d’accès : session requise
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) Validation de l’identifiant utilisateur de session
  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    // 3) Validation du corps de requête (schéma strict)
    const body = await request.json()
    const parsed = MarkReadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const { notificationId } = parsed.data

    // 4) Récupération de la notification et de ses détenteurs potentiels (direct & via ticket)
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        isRead: true,
        userId: true,                     // notification adressée directement
        ticket: { select: { userId: true } }, // notification liée à un ticket
      },
    })
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    // 5) Construction de la liste des propriétaires de la notification
    const ownerIds = [
      notification.userId ?? undefined,
      notification.ticket?.userId ?? undefined,
    ].filter((x): x is number => Number.isFinite(x as number))

    if (ownerIds.length === 0) {
      // Cas défensif : si aucun propriétaire n’est identifiable, on refuse l’opération
      return NextResponse.json({ error: 'Unowned notification' }, { status: 403 })
    }

    // 6) Vérification des droits : propriétaire direct ?
    const isOwner = ownerIds.includes(sessionUserId)

    // 7) Vérification des droits : ADMIN_USER gérant le(s) propriétaire(s) ?
    let isAdminManagingOwner = false
    if (!isOwner) {
      const current = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { centreRole: true },
      })

      if (current?.centreRole === 'ADMIN_USER') {
        const countManaged = await prisma.user.count({
          where: {
            id: { in: ownerIds },
            managerId: sessionUserId,
          },
        })
        isAdminManagingOwner = countManaged > 0
      }
    }

    if (!isOwner && !isAdminManagingOwner) {
      return NextResponse.json(
        { error: 'This notification does not belong to you' },
        { status: 403 }
      )
    }

    // 8) Mise à jour idempotente : marque la notification comme lue
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    })

    return NextResponse.json(
      { message: 'Notification marked as read', notification: updated },
      { status: 200 }
    )
  } catch (error) {
    // Journalisation côté serveur — ne pas exposer de détails internes au client
    console.error('Error marking notification as read:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// src/app/api/notification/mark-read/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { z } from 'zod'

const MarkReadSchema = z.object({
  notificationId: z.number(),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const parsed = MarkReadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const { notificationId } = parsed.data

    // Récupère la notif + les éventuels propriétaires (user direct / via ticket)
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        isRead: true,
        userId: true, // notif adressée directement
        ticket: { select: { userId: true } }, // notif liée à un ticket
      },
    })
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    const ownerIds = [
      notification.userId ?? undefined,
      notification.ticket?.userId ?? undefined,
    ].filter((x): x is number => Number.isFinite(x as number))

    if (ownerIds.length === 0) {
      // Cas improbable, on refuse par sécurité
      return NextResponse.json({ error: 'Unowned notification' }, { status: 403 })
    }

    // 1) Appartient directement à l’utilisateur connecté ?
    const isOwner = ownerIds.includes(sessionUserId)

    // 2) Sinon, est-ce un ADMIN_USER qui manage au moins un des owners ?
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

    // Marque comme lue (idempotent: si déjà lue, on renvoie la notif telle quelle)
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    })

    return NextResponse.json(
      { message: 'Notification marked as read', notification: updated },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

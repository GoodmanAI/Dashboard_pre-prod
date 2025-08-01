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
  // 1. Récupérer et valider la session
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Caster l'ID en nombre pour Prisma
  const userId = Number(session.user.id)
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    // 3. Valider le body avec Zod
    const body = await request.json()
    const parsed = MarkReadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const { notificationId } = parsed.data

    // 4. Récupérer la notification et vérifier l'appartenance
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id:      true,
        userId:  true,
        ticket:  { select: { userId: true } }, // pour s'assurer que tu ne marques que tes propres tickets
      },
    })
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    // 5. Vérifier que la notification appartient bien à l'utilisateur
    //    soit qu'il en soit le destinataire, soit que ce soit son ticket
    if (notification.userId !== userId && notification.ticket?.userId !== userId) {
      return NextResponse.json(
        { error: 'This notification does not belong to you' },
        { status: 403 }
      )
    }

    // 6. Marquer comme lue
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data:  { isRead: true },
    })

    return NextResponse.json(
      { message: 'Notification marked as read', notification: updated },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

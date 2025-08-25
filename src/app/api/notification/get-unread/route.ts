// app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    const { searchParams } = request.nextUrl
    const asUserIdParam = searchParams.get('asUserId')

    // Par défaut: soi-même
    let effectiveUserId = sessionUserId

    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam)
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: 'Invalid asUserId' }, { status: 400 })
      }

      if (asUserId !== sessionUserId) {
        // Doit être ADMIN_USER
        const current = await prisma.user.findUnique({
          where: { id: sessionUserId },
          select: { centreRole: true },
        })
        if (current?.centreRole !== 'ADMIN_USER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Et manager du compte ciblé
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

    // Notifications non lues:
    //  - liées à un ticket de l'utilisateur ciblé
    //  - OU adressées directement à l'utilisateur ciblé (notification.userId)
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ notifications }, { status: 200 })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

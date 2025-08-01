// app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // 1. Récupération de la session
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Cast de l'ID en nombre pour Prisma
  const userId = Number(session.user.id)
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    // 3. Requête : notifications non lues dont le ticket appartient à l'utilisateur
    const notifications = await prisma.notification.findMany({
      where: {
        isRead: false,
        ticket: {
          userId: userId
        }
      },
      select: {
        id:        true,
        message:   true,
        isRead:    true,
        createdAt: true,
        ticket: {
          select: {
            id:        true,
            subject:   true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ notifications }, { status: 200 })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

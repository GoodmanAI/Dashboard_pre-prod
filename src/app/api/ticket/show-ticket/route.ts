// src/app/api/tickets/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function GET(request: NextRequest) {
  // 1. Récupérer et valider la session
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Caster l'ID de session (string) en number
  const userId = Number(session.user.id)
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    // 3. Récupérer les tickets du user triés par date et 
    //    inclure l'auteur (createdBy) pour traçabilité
    const tickets = await prisma.ticket.findMany({
      where: { userId },
      select: {
        id:         true,
        subject:    true,
        message:    true,
        status:     true,
        createdAt:  true,
        updatedAt:  true,
        createdBy: {
          select: {
            id:    true,
            name:  true,
            email: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ tickets }, { status: 200 })
  } catch (error) {
    console.error('Error fetching tickets:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

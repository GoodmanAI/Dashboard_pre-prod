// app/api/client/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = Number(session.user.id)

    const client = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        centreRole: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,

        managedUsers: {
          select: {
            id: true,
            name: true,
            email: true,
            centreRole: true,
            address: true,
            city: true,
            postalCode: true,
            country: true,
            userProducts: {
              select: {
                assignedAt: true,
                product: {
                  select: { id: true, name: true, description: true },
                },
                explainDetails: {
                  select: {
                    metricsByMonth: true,
                    metricsUpdatedAt: true,
                  },
                },
                talkDetails: {
                  select: {
                    talkInfoValidated: true,
                    talkLibelesValidated: true,
                  },
                },
              },
            },
          },
        },

        userProducts: {
          select: {
            assignedAt: true,
            product: {
              select: { id: true, name: true, description: true },
            },
            explainDetails: {
              select: {
                metricsByMonth: true,
                commentsByMonth: true,
                metricsUpdatedAt: true,
              },
            },
            talkDetails: {
              select: {
                talkInfoValidated: true,
                talkLibelesValidated: true,
              },
            },
          },
        },
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(client, { status: 200 })
  } catch (error) {
    console.error('Error fetching client data:', error)
    return NextResponse.json(
      { error: 'An unknown error occurred' },
      { status: 500 },
    )
  }
}

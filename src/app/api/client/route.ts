// app/api/client/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionUserId = Number(session.user.id)
    const { searchParams } = request.nextUrl
    const asUserIdParam = searchParams.get('asUserId')
    let effectiveUserId = sessionUserId

    // On récupère le centreRole de l'utilisateur connecté pour la vérif éventuelle
    const currentUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { centreRole: true },
    })
    if (!currentUser) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Si on cible un autre user que soi-même, on vérifie les droits ADMIN_USER + relation manager
    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam)
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: 'Invalid asUserId' }, { status: 400 })
      }

      if (asUserId !== sessionUserId) {
        if (currentUser.centreRole !== 'ADMIN_USER') {
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

    // Sélecteur commun pour l'utilisateur "ciblé"
    const baseSelect = {
      id: true,
      name: true,
      email: true,
      role: true,
      centreRole: true,
      address: true,
      city: true,
      postalCode: true,
      country: true,

      userProducts: {
        select: {
          assignedAt: true,
          product: { select: { id: true, name: true, description: true } },
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
    } as const

    // On inclut managedUsers UNIQUEMENT quand on demande son propre profil et qu'on est ADMIN_USER
    const select =
      effectiveUserId === sessionUserId && currentUser.centreRole === 'ADMIN_USER'
        ? {
            ...baseSelect,
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
                    product: { select: { id: true, name: true, description: true } },
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
          }
        : { ...baseSelect }

    const client = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select,
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

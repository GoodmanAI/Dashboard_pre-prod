export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

/**
 * GET /api/client
 * -----------------------------------------------------------------------------
 * Renvoie le profil du client (utilisateur/centre) courant, avec possibilité
 * d’« agir pour » un centre géré via le paramètre ?asUserId=.
 *
 * Sécurité & rôles
 * - Requiert une session NextAuth valide.
 * - ?asUserId= est autorisé uniquement si l’utilisateur courant possède le rôle
 *   de centre ADMIN_USER ET est le manager du centre ciblé.
 *
 * Sélection des données
 * - Le bloc `baseSelect` définit les champs communs renvoyés pour l’utilisateur cible,
 *   incluant les produits et leurs détails (Explain/Talk).
 * - Les `managedUsers` ne sont inclus que si l’utilisateur consulte son propre profil
 *   ET qu’il est ADMIN_USER (pour éviter d’exposer l’arborescence à des tiers).
 *
 * Codes de réponse
 * - 200: profil renvoyé.
 * - 400: paramètre de requête invalide.
 * - 401: non authentifié.
 * - 403: non autorisé (impersonation non permise).
 * - 404: utilisateur/cible introuvable.
 * - 500: erreur interne.
 */
export async function GET(request: NextRequest) {
  try {
    // Vérification de session
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Résolution de l'identité effective (impersonation éventuelle)
    const sessionUserId = Number(session.user.id)
    const { searchParams } = request.nextUrl
    const asUserIdParam = searchParams.get('asUserId')
    let effectiveUserId = sessionUserId

    // Récupération du role de centre de l’utilisateur courant
    const currentUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { centreRole: true },
    })
    if (!currentUser) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Impersonation : contrôle d’éligibilité et relation manager → centre géré
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

    // Sélecteur commun pour l’utilisateur cible (profil + produits + détails)
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
          id: true,
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

    /**
     * Inclusion conditionnelle des centres gérés :
     * - Seulement lorsque l’on consulte SON propre profil
     * - Et que l’utilisateur courant est ADMIN_USER
     */
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

    // Lecture du profil cible
    const client = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select,
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(client, { status: 200 })
  } catch (error) {
    // Journalisation côté serveur uniquement (pas de fuite d’informations)
    console.error('Error fetching client data:', error)
    return NextResponse.json(
      { error: 'An unknown error occurred' },
      { status: 500 },
    )
  }
}

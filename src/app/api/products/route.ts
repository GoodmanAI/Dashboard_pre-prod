export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

/**
 * GET /api/products
 * -----------------------------------------------------------------------------
 * Expose la liste des produits selon le périmètre d’accès de l’appelant.
 *
 * Sécurité & autorisations
 * - Requiert une session valide.
 * - Règles d’accès :
 *   • ADMIN : peut lister tous les produits (tous centres) ou filtrer
 *     par centre via ?asUserId=<id>.
 *   • CLIENT (centre) :
 *       - Sans asUserId : ne voit que ses propres produits.
 *       - Avec asUserId : doit être ADMIN_USER et manager du centre ciblé.
 *
 * Paramètres de requête
 * - asUserId?: number — Facultatif. Cible un centre géré (ADMIN/ADMIN_USER).
 *
 * Forme de la réponse (200)
 * [
 *   {
 *     id: number,
 *     name: string,
 *     description: string | null,
 *     centres: [
 *       {
 *         id: number,
 *         name: string | null,
 *         email: string,
 *         role: 'ADMIN_USER' | 'USER' | null,
 *         address: string | null,
 *         city: string | null,
 *         postalCode: string | null,
 *         country: string | null,
 *         assignedAt: string (ISO)
 *       }, ...
 *     ]
 *   }, ...
 * ]
 *
 * Codes de réponse
 * - 200 : succès.
 * - 400 : paramètre invalide.
 * - 401 : non authentifié.
 * - 403 : accès interdit.
 * - 500 : erreur interne.
 */
export async function GET(request: NextRequest) {
  // 1) Contrôle d’accès : session requise
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) Hydrate le contexte d’appelant (id/role) et charge le centreRole si compte “centre”
  const sessionUserId = Number(session.user.id)
  const sessionRole = session.user.role as 'ADMIN' | 'CLIENT'
  const currentUser = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { centreRole: true },
  })

  // 3) Lecture/validation du filtre asUserId
  const { searchParams } = request.nextUrl
  const asUserIdParam = searchParams.get('asUserId')
  const asUserId = asUserIdParam ? Number(asUserIdParam) : undefined
  if (asUserIdParam && !Number.isFinite(asUserId)) {
    return NextResponse.json({ error: 'Invalid asUserId' }, { status: 400 })
  }

  try {
    // -------------------------------------------------------------------------
    // Cas A — Rôle ADMIN : visibilité globale, avec ou sans filtre asUserId
    // -------------------------------------------------------------------------
    if (sessionRole === 'ADMIN') {
      // A1) Sans asUserId : retourne tous les produits et leurs centres affiliés
      if (!asUserId) {
        const products = await prisma.product.findMany({
          select: {
            id: true,
            name: true,
            description: true,
            userProducts: {
              select: {
                assignedAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    centreRole: true,
                    address: true,
                    city: true,
                    postalCode: true,
                    country: true,
                  },
                },
              },
            },
          },
        })

        const formatted = products.map((prod) => ({
          id: prod.id,
          name: prod.name,
          description: prod.description,
          centres: prod.userProducts.map((up) => ({
            id: up.user.id,
            name: up.user.name,
            email: up.user.email,
            role: up.user.centreRole,
            address: up.user.address,
            city: up.user.city,
            postalCode: up.user.postalCode,
            country: up.user.country,
            assignedAt: up.assignedAt,
          })),
        }))

        return NextResponse.json(formatted, { status: 200 })
      }

      // A2) Avec asUserId : limite aux produits affiliés à ce centre
      const products = await prisma.product.findMany({
        where: { userProducts: { some: { userId: asUserId } } },
        select: {
          id: true,
          name: true,
          description: true,
          userProducts: {
            where: { userId: asUserId },
            select: {
              assignedAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  centreRole: true,
                  address: true,
                  city: true,
                  postalCode: true,
                  country: true,
                },
              },
            },
          },
        },
      })

      const formatted = products.map((prod) => ({
        id: prod.id,
        name: prod.name,
        description: prod.description,
        centres: prod.userProducts.map((up) => ({
          id: up.user.id,
          name: up.user.name,
          email: up.user.email,
          role: up.user.centreRole,
          address: up.user.address,
          city: up.user.city,
          postalCode: up.user.postalCode,
          country: up.user.country,
          assignedAt: up.assignedAt,
        })),
      }))

      return NextResponse.json(formatted, { status: 200 })
    }

    // -------------------------------------------------------------------------
    // Cas B — Rôle CLIENT (ADMIN_USER ou USER)
    // -------------------------------------------------------------------------
    let effectiveUserId = sessionUserId

    // B1) Ciblage d’un autre centre : requis ADMIN_USER + relation de gestion
    if (asUserId && asUserId !== sessionUserId) {
      if (currentUser?.centreRole !== 'ADMIN_USER') {
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

    // B2) Récupère les produits affiliés à l’utilisateur “effectif” (soi ou centre géré)
    const products = await prisma.product.findMany({
      where: { userProducts: { some: { userId: effectiveUserId } } },
      select: {
        id: true,
        name: true,
        description: true,
        userProducts: {
          where: { userId: effectiveUserId },
          select: {
            assignedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                centreRole: true,
                address: true,
                city: true,
                postalCode: true,
                country: true,
              },
            },
          },
        },
      },
    })

    const formatted = products.map((prod) => ({
      id: prod.id,
      name: prod.name,
      description: prod.description,
      centres: prod.userProducts.map((up) => ({
        id: up.user.id,
        name: up.user.name,
        email: up.user.email,
        role: up.user.centreRole,
        address: up.user.address,
        city: up.user.city,
        postalCode: up.user.postalCode,
        country: up.user.country,
        assignedAt: up.assignedAt,
      })),
    }))

    return NextResponse.json(formatted, { status: 200 })
  } catch (err) {
    // Journalisation côté serveur — ne pas exposer de détails applicatifs
    console.error('Error fetching products:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

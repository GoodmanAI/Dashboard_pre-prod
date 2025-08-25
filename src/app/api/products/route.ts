// src/app/api/products/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionUserId = Number(session.user.id)
  const sessionRole = session.user.role as 'ADMIN' | 'CLIENT' // Role enum
  // centreRole n'est défini que pour les comptes “centre”
  const currentUser = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { centreRole: true },
  })

  const { searchParams } = request.nextUrl
  const asUserIdParam = searchParams.get('asUserId')
  const asUserId = asUserIdParam ? Number(asUserIdParam) : undefined
  if (asUserIdParam && !Number.isFinite(asUserId)) {
    return NextResponse.json({ error: 'Invalid asUserId' }, { status: 400 })
  }

  try {
    // =======================
    // 1) SUPER-ADMIN (role=ADMIN)
    // =======================
    if (sessionRole === 'ADMIN') {
      if (!asUserId) {
        // Comportement actuel: tous les produits + tous les centres
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

      // ADMIN + asUserId → filtre sur ce centre
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

    // =======================
    // 2) ADMIN_USER ou USER
    // =======================
    let effectiveUserId = sessionUserId

    if (asUserId && asUserId !== sessionUserId) {
      // Seuls les ADMIN_USER peuvent cibler un centre géré
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

    // Produits assignés à l'utilisateur “effectif”
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
    console.error('Error fetching products:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

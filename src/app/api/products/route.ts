// src/app/api/products/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

// Interface améliorée pour inclure les infos “centre”
interface ProductWithClients {
  id: number
  name: string
  description: string | null
  userProducts: {
    assignedAt: Date
    user: {
      id: number
      name: string | null
      email: string
      centreRole: 'ADMIN_USER' | 'USER' | null
      address: string | null
      city: string | null
      postalCode: string | null
      country: string | null
    }
  }[]
}

export async function GET(request: NextRequest) {
  // 1. Vérifier la session et le rôle
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Access denied. Only super-admins can view products.' },
      { status: 403 }
    )
  }

  try {
    // 2. Charger tous les produits et leurs “centres” affiliés
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
              }
            }
          }
        }
      }
    })

    // 3. Reformater pour le front
    const formatted = products.map(prod => ({
      id: prod.id,
      name: prod.name,
      description: prod.description,
      centres: prod.userProducts.map(up => ({
        id: up.user.id,
        name: up.user.name,
        email: up.user.email,
        role: up.user.centreRole,
        address: up.user.address,
        city: up.user.city,
        postalCode: up.user.postalCode,
        country: up.user.country,
        assignedAt: up.assignedAt,
      }))
    }))

    return NextResponse.json(formatted, { status: 200 })
  } catch (err) {
    console.error('Error fetching products:', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

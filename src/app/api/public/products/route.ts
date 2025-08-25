// src/app/api/products/public/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'

export const dynamic = 'force-static'

export async function GET(request: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userProducts: true,
          }
        }
      },
      orderBy: { name: 'asc' },
    })

    const formatted = products.map(p => ({
      id:          p.id,
      name:        p.name,
      description: p.description,
      createdAt:   p.createdAt.toISOString(),
      updatedAt:   p.updatedAt.toISOString(),
      centresCount: p._count.userProducts,
    }))

    return NextResponse.json(formatted, { status: 200 })
  } catch (error) {
    console.error('Error fetching public products:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'An unknown error occurred.' },
      { status: 500 }
    )
  }
}

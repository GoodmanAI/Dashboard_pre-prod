import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'

export const dynamic = 'force-static'

export async function GET(request: NextRequest) {
  try {
    // On récupère les produits réellement utilisés (distincts)
    const userProducts = await prisma.userProduct.findMany({
      distinct: ['productId'],
      select: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        product: { name: 'asc' },
      },
    })

    // On normalise les données
    const formatted = userProducts.map(up => ({
      id:           up.product.id,
      name:         up.product.name,
      description:  up.product.description,
      createdAt:    up.product.createdAt.toISOString(),
      updatedAt:    up.product.updatedAt.toISOString(),
    }))

    return NextResponse.json(formatted, { status: 200 })
  } catch (error) {
    console.error('Error fetching products from UserProduct:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products.' },
      { status: 500 }
    )
  }
}

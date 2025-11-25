import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = parseInt(params.userId, 10)
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400 }
      )
    }

    // Vérification existence user (optionnel mais recommandé)
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    })

    if (!userExists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Récupération des produits liés au user
    const userProducts = await prisma.userProduct.findMany({
      where: { userId },
      select: {
        id: true,
        assignedAt: true,
        removedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: { assignedAt: 'asc' }
    })

    console.log(userProducts);
    // Normalisation des dates
    const formatted = userProducts.map(up => ({
      id: up.id,
      name: up.product.name,
      description: up.product.description,
      createdAt: up.product.createdAt.toISOString(),
      updatedAt: up.product.updatedAt.toISOString(),
      assignedAt: up.assignedAt?.toISOString(),
      removedAt: up.removedAt?.toISOString()
    }))

    return NextResponse.json(formatted, { status: 200 })
  } catch (error) {
    console.error('Error fetching user products:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { requireAuth, assertUserAccess } from "@/lib/auth-helpers"

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const userId = parseInt(params.userId, 10)
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400 }
      )
    }

    const accessErr = await assertUserAccess(session, userId);
    if (accessErr) return accessErr;

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
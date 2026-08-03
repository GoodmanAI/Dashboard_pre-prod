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

    // Verification existence user + recup du managerId (chantier 3 : les
    // sous-comptes CLIENT n'ont pas de UserProduct en propre — ils heritent
    // de ceux du compte parent).
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, managerId: true, permissions: true },
    });

    if (!userExists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Determination du userId "effectif" pour lister les products :
    // - Si le user est un sous-compte (permissions custom set + managerId
    //   non null), on remonte au parent
    // - Sinon on garde le user courant
    const isSubAccount =
      userExists.role === "CLIENT" &&
      userExists.managerId != null &&
      userExists.permissions != null;
    const effectiveUserId = isSubAccount ? (userExists.managerId as number) : userId;

    // Récupération des produits liés au user (parent si sous-compte)
    const userProducts = await prisma.userProduct.findMany({
      where: { userId: effectiveUserId },
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
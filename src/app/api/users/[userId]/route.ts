import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserAccess } from "@/lib/auth-helpers";

/**
 * GET /api/users/[userId]
 * -----------------------------------------------------------------------------
 * Retourne le profil user + userProductId Talk.
 *
 * Fix chantier 3 (Lot A) :
 *   - Ownership : requireAuth + assertUserAccess. Un CLIENT ne peut plus
 *     lire n'importe quel user via cet endpoint.
 *   - Password hash : le SELECT est explicite (whitelist), plus de spread
 *     naif qui leakait le hash bcrypt.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userId = parseInt(params.userId, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const ownershipErr = await assertUserAccess(auth.session, userId);
  if (ownershipErr) return ownershipErr;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centreRole: true,
      isSecretary: true,
      address: true,
      city: true,
      postalCode: true,
      country: true,
      managerId: true,
      createdAt: true,
      updatedAt: true,
      userProducts: {
        where: {
          productId: 2,
          removedAt: null,
        },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userProductId = user.userProducts[0]?.id ?? null;

  return NextResponse.json({
    ...user,
    userProductId,
    userProducts: undefined,
  });
}

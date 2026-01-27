import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const userId = parseInt(params.userId, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userProducts: {
        where: {
          productId: 2,
          removedAt: null,
        },
        take: 1,
        select: {
          id: true, // c’est le userProductId
        },
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
    userProducts: undefined, // optionnel : pour ne pas renvoyer le tableau brut
  });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * GET /api/admin/centres
 * -----------------------------------------------------------------------------
 * Renvoie la liste de tous les centres (utilisateurs CLIENT) avec leurs
 * UserProducts, au format attendu par CentreContext (`ManagedUser`).
 *
 * Accès : réservé aux comptes `role === "ADMIN"`.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can access this route." },
        { status: 403 }
      );
    }

    const centres = await prisma.user.findMany({
      where: { role: "CLIENT" },
      select: {
        id: true,
        name: true,
        email: true,
        centreRole: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        userProducts: {
          select: {
            id: true,
            assignedAt: true,
            product: { select: { id: true, name: true, description: true } },
            talkDetails: {
              select: {
                talkInfoValidated: true,
                talkLibelesValidated: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Ne garder que les centres qui ont un produit Talk (sinon la page appels n'a pas de sens)
    const withTalk = centres
      .filter((c) =>
        c.userProducts.some((up) => up.product?.name?.includes("Talk"))
      )
      .map((c) => {
        const talkUp = c.userProducts.find((up) =>
          up.product?.name?.includes("Talk")
        );
        return {
          ...c,
          userProductId: talkUp?.id ?? null,
        };
      });

    return NextResponse.json(withTalk, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error("Error fetching admin centres:", err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

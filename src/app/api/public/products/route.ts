import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";

export async function GET(request: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error("Error fetching public products:", err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

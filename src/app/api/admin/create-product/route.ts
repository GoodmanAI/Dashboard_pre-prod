import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";

// Schéma de validation pour la création d'un produit
const CreateProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can create products." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validation des données reçues
    const parseResult = CreateProductSchema.safeParse(body);
    if (!parseResult.success) {
      const validationErrors = parseResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 }
      );
    }

    const { name, description } = parseResult.data;

    // Créer le produit
    const newProduct = await prisma.product.create({
      data: {
        name,
        description,
      },
    });

    return NextResponse.json(
      { message: "Product created successfully", product: newProduct },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

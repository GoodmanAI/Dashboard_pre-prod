import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { z } from "zod";

// Schéma de validation des données entrantes
const ResetPasswordSchema = z.object({
  clientId: z.number().int("Client ID must be an integer"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[@$!%*?&]/, "Password must contain at least one special character"),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier la session et les permissions
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can reset passwords." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validation des données reçues
    const parseResult = ResetPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { clientId, name, email, newPassword } = parseResult.data;

    // Vérifier si le client existe
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, email: true, password: true, role: true },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Invalid credentials." }, // Masque si l'ID est invalide
        { status: 400 }
      );
    }

    // Vérifier si les informations correspondent
    if (client.name !== name) {
      return NextResponse.json(
        { error: "The provided name does not match our records." },
        { status: 400 }
      );
    }

    if (client.email !== email) {
      return NextResponse.json(
        { error: "The provided email does not match our records." },
        { status: 400 }
      );
    }

    // Empêcher la réinitialisation pour les comptes admin
    if (client.role === "ADMIN") {
      return NextResponse.json(
        { error: "Cannot reset password for admin accounts." },
        { status: 403 }
      );
    }

    // Vérifier si le mot de passe est identique à l'ancien
    const isSamePassword = await bcrypt.compare(newPassword, client.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "New password cannot be the same as the old password." },
        { status: 400 }
      );
    }

    // Hash du nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Mettre à jour le mot de passe
    await prisma.user.update({
      where: { id: clientId },
      data: { password: hashedPassword },
    });

    return NextResponse.json(
      { message: "Password reset successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error resetting password:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

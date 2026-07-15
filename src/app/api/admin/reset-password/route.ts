import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import { passwordSchema } from "@/lib/passwordSchema";
import {
  extractClientIp,
  checkIpRateLimit,
  recordLoginAttempt,
} from "@/lib/loginSecurity";

// Schéma de validation des données entrantes
const ResetPasswordSchema = z.object({
  clientId: z.number().int("Client ID must be an integer"),
  name: z.string().min(1, "Name is required"),
  // Historiquement nommé "email" mais en réalité un identifiant libre : les
  // vieux clients ont des identifiants type "Montchanin" sans @. On accepte
  // n'importe quelle string >= 1 char, avec trim + lowercase pour matcher les
  // enregistrements dont l'email est normalisé en lowercase côté DB.
  email: z
    .string()
    .min(1, "Identifiant is required")
    .transform((v) => v.trim().toLowerCase()),
  newPassword: passwordSchema,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit IP en tout premier — protège contre une session admin
    // compromise qui bruteforcerait la triplette (clientId, name, email)
    // requise pour reset le mot de passe d'un client. Réutilise le compteur
    // global LoginAttempt : 5 échecs / 15 min / IP tous endpoints confondus.
    const ip = extractClientIp(request.headers);
    const rate = await checkIpRateLimit(ip);
    if (rate.limited) {
      const mins = Math.ceil(rate.retryAfterSeconds / 60);
      return NextResponse.json(
        {
          error: `Trop de tentatives depuis cette adresse. Réessayez dans ${mins} minute${mins > 1 ? "s" : ""}.`,
        },
        { status: 429 }
      );
    }

    // Vérifier la session et les permissions
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied. Only admins can reset passwords." },
        { status: 403 }
      );
    }
    const adminEmail = session.user.email ?? "unknown-admin";

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
      await recordLoginAttempt(ip, adminEmail, false);
      return NextResponse.json(
        { error: "Invalid credentials." }, // Masque si l'ID est invalide
        { status: 400 }
      );
    }

    // Vérifier si les informations correspondent
    if (client.name !== name) {
      await recordLoginAttempt(ip, adminEmail, false);
      return NextResponse.json(
        { error: "The provided name does not match our records." },
        { status: 400 }
      );
    }

    if (client.email !== email) {
      await recordLoginAttempt(ip, adminEmail, false);
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

    // Trace le succès (utile pour l'audit — reporting connexion pro futur).
    await recordLoginAttempt(ip, adminEmail, true);

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

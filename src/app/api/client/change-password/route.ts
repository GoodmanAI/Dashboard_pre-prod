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

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
  newPassword: passwordSchema,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit IP en tout premier — protège contre un attaquant qui aurait
    // volé une session valide et bruteforcerait `currentPassword`. Réutilise
    // le compteur global LoginAttempt (partagé avec le login) : 5 échecs / 15
    // min / IP tous endpoints d'auth confondus.
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

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const parseResult = ChangePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      return NextResponse.json(
        { error: firstError || "Données invalides." },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 }
      );
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      // Trace pour rate limit + audit — même canal que le login.
      await recordLoginAttempt(ip, session.user.email, false);
      return NextResponse.json(
        { error: "Le mot de passe actuel est incorrect." },
        { status: 400 }
      );
    }

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return NextResponse.json(
        { error: "Le nouveau mot de passe doit être différent de l'ancien." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Trace le succès (utile pour l'audit — reporting connexion pro futur).
    await recordLoginAttempt(ip, session.user.email, true);

    return NextResponse.json(
      { message: "Mot de passe modifié avec succès." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue." },
      { status: 500 }
    );
  }
}

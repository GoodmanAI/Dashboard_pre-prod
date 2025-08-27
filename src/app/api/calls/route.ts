export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { subDays } from "date-fns";

/**
 * GET /api/calls
 * ---------------------------------------------------------------------------
 * Récupère la liste des appels d’un utilisateur (centre) avec filtres optionnels.
 *
 * Authentification
 * - Requiert une session NextAuth valide.
 * - Supporte l’“impersonation” via ?asUserId= lorsque l’utilisateur courant
 *   possède le rôle de centre ADMIN_USER et gère le centre ciblé.
 *
 * Paramètres de requête (query)
 * - intent?: string            → filtre exact (insensible à la casse) sur l’intention.
 * - daysAgo?: number | "all"   → si nombre, restreint aux appels créés depuis N jours ;
 *                                si "all" ou absent, pas de filtre temporel.
 * - asUserId?: number          → identifiant d’un centre géré (utilisable uniquement par un ADMIN_USER
 *                                qui est le manager du centre ciblé).
 *
 * Codes de réponse
 * - 200: liste des appels.
 * - 400: paramètre de requête invalide.
 * - 403: accès refusé (non connecté ou non autorisé pour asUserId).
 * - 500: erreur serveur inattendue.
 *
 * Remarques d’implémentation
 * - Le filtre “intent” est appliqué en mode insensible à la casse côté Prisma.
 * - Le filtre temporel s’appuie sur createdAt >= now - daysAgo.
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifie la présence d’une session utilisateur
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Access denied. Seuls les utilisateurs connectés peuvent accéder à leurs appels" },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const intent = searchParams.get("intent") ?? undefined;

    // Parse du filtre temporel (daysAgo)
    const daysAgoParam = searchParams.get("daysAgo");
    const parsed = daysAgoParam && daysAgoParam !== "all" ? Number(daysAgoParam) : undefined;
    const daysAgo = Number.isFinite(parsed as number) ? (parsed as number) : undefined;

    // Résolution de l’utilisateur effectif (impersonation pour ADMIN_USER)
    const asUserIdParam = searchParams.get("asUserId");
    let effectiveUserId = session.user.id;

    if (asUserIdParam) {
      const asUserId = Number(asUserIdParam);
      if (!Number.isFinite(asUserId)) {
        return NextResponse.json({ error: "Paramètre asUserId invalide." }, { status: 400 });
      }

      // Sécurité : n’autoriser l’accès à un autre user que si ADMIN_USER + centre géré
      if (asUserId !== session.user.id) {
        const current = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { centreRole: true },
        });

        if (current?.centreRole !== "ADMIN_USER") {
          return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
        }

        const managed = await prisma.user.findFirst({
          where: { id: asUserId, managerId: session.user.id },
          select: { id: true },
        });

        if (!managed) {
          return NextResponse.json({ error: "Centre non géré par cet administrateur." }, { status: 403 });
        }

        effectiveUserId = asUserId;
      }
    }

    // Construction du filtre Prisma
    const where: any = {
      userId: effectiveUserId,
      ...(intent && { intent: { equals: intent, mode: "insensitive" } }),
    };

    if (daysAgo !== undefined) {
      where.createdAt = { gte: subDays(new Date(), daysAgo) };
    }

    // Requête et tri décroissant par date de création
    const calls = await prisma.call.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    // Journalisation serveur pour diagnostic ; message générique côté client
    console.error("Error fetching calls:", error);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

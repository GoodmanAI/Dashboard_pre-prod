export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * POST /api/admin/users/[id]/kick (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * Force la deconnexion a distance d'un compte en incrementant son
 * tokenVersion. Le prochain refresh JWT le rejettera (jwt callback dans
 * authOptions verifie tokenVersion DB > tokenVersion JWT -> token vide ->
 * middleware redirect signin).
 *
 * Utile en cas de :
 *   - Compte compromis (attaquant qui a un cookie session valide)
 *   - Depart d'un secretaire / admin
 *   - Modification urgente de permissions (l'user perd immediatement l'acces
 *     a une page si on lui retire, meme s'il a un cookie session actif)
 *
 * Refuse le kick sur soi-meme (evite le lockout accidentel).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const userId = parseInt(params.id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (userId === auth.session.user.id) {
    return NextResponse.json(
      { error: "Impossible de vous kicker vous-meme." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  const ip = extractIpFromRequest(req);
  const userAgent = extractUserAgent(req);
  auditLog("auth", "kick-session", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip,
      userAgent,
    },
    target: { type: "user", id: userId, label: target.email },
    metadata: {
      role: target.role,
      previousTokenVersion: target.tokenVersion,
      newTokenVersion: updated.tokenVersion,
    },
  });

  return NextResponse.json({
    kicked: true,
    tokenVersion: updated.tokenVersion,
  });
}

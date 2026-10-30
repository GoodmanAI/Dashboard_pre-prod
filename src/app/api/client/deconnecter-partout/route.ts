export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * POST /api/client/deconnecter-partout (30/10/2026)
 * -----------------------------------------------------------------------------
 * Le client ferme toutes ses sessions, sur tous ses appareils : même mécanisme que le
 * kick admin (`/api/admin/users/[id]/kick`), `tokenVersion` incrémenté, et le prochain
 * rafraîchissement du JWT est refusé.
 *
 * La session en cours tombe AUSSI, délibérément. La garder demanderait de laisser le
 * client réécrire la `tokenVersion` de son propre jeton (`update()` de NextAuth), ce
 * qui rouvrirait la porte à un cookie volé : on le laisse se reconnecter, l'écran le
 * dit avant le geste. Le client appelle `signOut()` juste après la réponse.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const userId = Number(auth.session.user.id);

  const avant = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, tokenVersion: true },
  });
  if (!avant) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const apres = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  auditLog("auth", "logout-everywhere", {
    actor: {
      id: userId,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "user", id: userId, label: avant.email },
    metadata: {
      previousTokenVersion: avant.tokenVersion,
      newTokenVersion: apres.tokenVersion,
    },
  });

  return NextResponse.json({ ok: true });
}

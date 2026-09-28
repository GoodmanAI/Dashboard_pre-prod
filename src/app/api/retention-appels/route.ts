export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { RETENTION_MIN_MOIS, RETENTION_MAX_MOIS } from "@/lib/retentionAppels";

/**
 * Délai de conservation des appels d'un centre (admin uniquement).
 *
 * Plan `plans/2026-09-retention-des-appels.md` (workspace). Passé ce délai, le job
 * `scripts/db-maintenance/anonymise_appels.sh` vide la transcription et la donnée
 * patient des appels, et la liste des appels ne les montre plus. Les statistiques
 * restent.
 *
 * Réglage de l'admin SEUL (décision du 28/09/2026) : c'est un engagement du centre
 * sur la donnée de ses patients, pas un réglage d'écran. Aucune surface
 * machine-à-machine : ne pas ajouter à `PUBLIC_API_PATTERNS`.
 *
 *  GET /api/retention-appels?userProductId=N  → { userProductId, mois }
 *  PUT /api/retention-appels  { userProductId, mois }  → { userProductId, mois, precedent }
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const userProductId = Number(req.nextUrl.searchParams.get("userProductId"));
  if (!Number.isInteger(userProductId) || userProductId <= 0) {
    return NextResponse.json({ error: "userProductId manquant ou invalide." }, { status: 400 });
  }

  const centre = await prisma.userProduct.findUnique({
    where: { id: userProductId },
    select: { retentionAppelsMois: true },
  });
  if (!centre) {
    return NextResponse.json({ error: "Ce centre n'existe pas." }, { status: 404 });
  }

  return NextResponse.json({ userProductId, mois: centre.retentionAppelsMois });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const userProductId = Number(body?.userProductId);
  if (!Number.isInteger(userProductId) || userProductId <= 0) {
    return NextResponse.json({ error: "userProductId manquant ou invalide." }, { status: 400 });
  }

  const mois = Number(body?.mois);
  if (!Number.isInteger(mois) || mois < RETENTION_MIN_MOIS || mois > RETENTION_MAX_MOIS) {
    return NextResponse.json(
      {
        error: `Le délai doit être un nombre entier de mois, entre ${RETENTION_MIN_MOIS} et ${RETENTION_MAX_MOIS}.`,
      },
      { status: 400 }
    );
  }

  const avant = await prisma.userProduct.findFirst({
    where: { id: userProductId, removedAt: null },
    select: { retentionAppelsMois: true },
  });
  if (!avant) {
    return NextResponse.json(
      { error: "Ce centre n'existe pas ou n'est plus rattaché à ce produit." },
      { status: 404 }
    );
  }

  await prisma.userProduct.update({
    where: { id: userProductId },
    data: { retentionAppelsMois: mois },
  });

  auditLog("data", "retention-appels-set", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { precedent: avant.retentionAppelsMois, mois },
  });

  return NextResponse.json({ userProductId, mois, precedent: avant.retentionAppelsMois });
}

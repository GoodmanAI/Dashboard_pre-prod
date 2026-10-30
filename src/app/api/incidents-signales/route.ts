import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * Appels signalés par les clients, pour le rapport du matin (daily-report).
 *
 *  GET /api/incidents-signales?depuis=<ISO>[&jusqua=<ISO>]   (x-api-key: DAILY_REPORT_API_KEY)
 *
 * Lot 0 de `plans/2026-10-amelioration-continue-lyraetalk.md` (workspace). Lecture
 * seule, tout le parc : clé API SEULE, jamais une session (un compte client verrait
 * les signalements des autres centres). La clé n'ouvre qu'une autre route,
 * `/api/konnect-stats-hebdo` (agrégats de Konnect, 29/10/2026).
 *
 * Le filtre porte sur la date du SIGNALEMENT (`flaggedAt`), pas sur celle de l'appel :
 * un appel de lundi signalé mercredi remonte mercredi. `callId` est le `callId` des
 * lignes Loki, posé par LyraeTalk depuis la v2.60.1 ; `null` sur un appel plus ancien.
 *
 * Ne rend ni transcription ni numéro. `flagComment` peut porter une donnée patient
 * écrite par la secrétaire : le consommateur ne le fait pas sortir de sa VM.
 */

const FENETRE_MAX_JOURS = 31;

function lireDate(valeur: string | null): Date | null {
  if (!valeur) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "DAILY_REPORT_API_KEY");
  if (keyErr) return keyErr;

  const { searchParams } = new URL(req.url);
  const jusqua = lireDate(searchParams.get("jusqua")) ?? new Date();
  const depuis =
    lireDate(searchParams.get("depuis")) ?? new Date(jusqua.getTime() - 24 * 3600 * 1000);

  if (depuis >= jusqua) {
    return NextResponse.json({ error: "`depuis` doit précéder `jusqua`" }, { status: 400 });
  }
  if (jusqua.getTime() - depuis.getTime() > FENETRE_MAX_JOURS * 24 * 3600 * 1000) {
    return NextResponse.json(
      { error: `Fenêtre limitée à ${FENETRE_MAX_JOURS} jours` },
      { status: 400 }
    );
  }

  const lignes = await prisma.callConversation.findMany({
    where: { flagged: true, flaggedAt: { gte: depuis, lt: jusqua } },
    select: {
      id: true,
      userProductId: true,
      createdAt: true,
      flaggedAt: true,
      flagComment: true,
      anonymiseeLe: true,
      stats: true,
    },
    orderBy: { flaggedAt: "asc" },
  });

  const incidents = lignes.map((l) => {
    const stats = (l.stats ?? {}) as Record<string, unknown>;
    return {
      id: l.id,
      userProductId: l.userProductId,
      appeleLe: l.createdAt,
      flaggedAt: l.flaggedAt,
      flagComment: l.flagComment,
      callId: typeof stats.callId === "string" ? stats.callId : null,
      anonymise: l.anonymiseeLe !== null,
    };
  });

  return NextResponse.json({ depuis, jusqua, incidents });
}

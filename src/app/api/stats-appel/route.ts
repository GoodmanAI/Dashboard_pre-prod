import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { PAGES_ADMIN } from "@/lib/accesInternes";
import { peutOuvrirAdmin } from "@/lib/pageAccess";
import { SQL_PATIENT_A_PARLE, SQL_SANS_PAROLE } from "@/lib/appelsSansParole";
import { Prisma } from "@prisma/client";
import { calculerApercu, calculerIndicateurs, calculerStatsAppels, LigneAppel } from "@/lib/statsAppel";

/**
 * GET /api/stats-appel?userProductId=…&from=…&to=…[&previousFrom=…&previousTo=…][&vue=apercu]
 *
 * Les statistiques d'appels de LyraeTalk, calculées ici (16/11/2026). Avant, l'écran
 * recevait chaque ligne d'appel des deux périodes (`/api/calls?mode=all&champs=stats`,
 * plusieurs Mo pour 30 jours) et faisait les calculs lui-même. La réponse ne porte plus que
 * des agrégats : aucune donnée patient, quelques Ko quelle que soit la période.
 *
 * Mêmes droits et mêmes lignes que `/api/calls` en `champs=stats` : session, centre du
 * compte, l'une des pages `calls`, `incidents` ou `stats_appel` en lecture ; appels de plus
 * de 15 secondes et de plus d'un échange, où le patient a parlé (ceux sans aucun mot sont
 * comptés à part dans `sansParole`, 22/11/2026) ; pas de borne de rétention (les statistiques
 * couvrent l'année, `stats` reste après l'anonymisation).
 *
 * Route de session, pas machine-à-machine. Plan : `plans/2026-11-chargements-dashboard.md`.
 */

/** Appels de la plage : plus de 15 s, plus d'un échange (bornes : voir `lireAppels`). */
function conditions(userProductId: number, depuis: Date, jusqua: Date): Prisma.Sql {
  // Bornes en texte ISO castées en `timestamp` (colonne sans fuseau portant de l'UTC) :
  // voir `lireAppels` de `/api/calls`.
  return Prisma.sql`"userProductId" = ${userProductId}
      AND "createdAt" >= ${depuis.toISOString()}::timestamp
      AND "createdAt" <= ${jusqua.toISOString()}::timestamp
      AND (stats::jsonb #> '{duration}') > '15'::jsonb
      AND COALESCE(
            "nbTours",
            CASE WHEN jsonb_typeof(steps::jsonb) = 'array' THEN jsonb_array_length(steps::jsonb) ELSE 0 END
          ) > 1`;
}

/** Les appels comptés : le patient a parlé (`appelsSansParole.ts`). `internal` retiré. */
async function lireStats(userProductId: number, depuis: Date, jusqua: Date): Promise<LigneAppel[]> {
  return prisma.$queryRaw<LigneAppel[]>`
    SELECT "createdAt", (stats::jsonb - 'internal') AS stats
    FROM "CallConversation"
    WHERE ${conditions(userProductId, depuis, jusqua)} AND ${SQL_PATIENT_A_PARLE}`;
}

/**
 * Les appels de plus de 15 s où le patient n'a dit aucun mot, comptés à part (tuile
 * « Appels sans parole »). Sans la condition « plus d'un échange » : la plupart n'ont que
 * l'accueil (un seul tour) et n'étaient déjà comptés nulle part ; la tuile les montre tous.
 */
async function compterSansParole(userProductId: number, depuis: Date, jusqua: Date): Promise<number> {
  const r = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "CallConversation"
    WHERE "userProductId" = ${userProductId}
      AND "createdAt" >= ${depuis.toISOString()}::timestamp
      AND "createdAt" <= ${jusqua.toISOString()}::timestamp
      AND (stats::jsonb #> '{duration}') > '15'::jsonb
      AND ${SQL_SANS_PAROLE}`;
  return r[0]?.n ?? 0;
}

const date = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const q = request.nextUrl.searchParams;
    const userProductId = Number(q.get("userProductId"));
    const from = date(q.get("from"));
    const to = date(q.get("to"));
    if (!Number.isFinite(userProductId) || userProductId <= 0 || !from || !to) {
      return NextResponse.json(
        { error: "Paramètres userProductId, from et to requis." },
        { status: 400 },
      );
    }
    const prevFrom = date(q.get("previousFrom"));
    const prevTo = date(q.get("previousTo"));

    // La carte d'un centre de la vue d'ensemble admin (`vue=apercu`) s'ouvre aussi à qui
    // a la vue d'ensemble (compte interne, 24/11/2026), sans les écrans d'appels du centre.
    const apercuPermis =
      q.get("vue") === "apercu" && peutOuvrirAdmin(auth.session.user as any, PAGES_ADMIN.VUE_ENSEMBLE);
    const [ownershipErr, droitErr] = await Promise.all([
      assertUserProductOwnership(auth.session, userProductId),
      apercuPermis ? Promise.resolve(null) : requireAnyPagePermission([PAGES.CALLS, PAGES.INCIDENTS, PAGES.STATS_APPEL], "read"),
    ]);
    if (ownershipErr) return ownershipErr;
    if (droitErr) return droitErr;

    // `vue=apercu` : la carte d'un centre de la vue d'ensemble admin.
    if (q.get("vue") === "apercu") {
      const lignes = await lireStats(userProductId, from, to);
      return NextResponse.json({ apercu: calculerApercu(lignes) }, { status: 200 });
    }

    const avecPrecedente = !!(prevFrom && prevTo);
    const [courante, precedente, sansParole, sansParolePrecedent] = await Promise.all([
      lireStats(userProductId, from, to),
      avecPrecedente ? lireStats(userProductId, prevFrom!, prevTo!) : Promise.resolve(null),
      compterSansParole(userProductId, from, to),
      avecPrecedente ? compterSansParole(userProductId, prevFrom!, prevTo!) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      {
        courant: calculerStatsAppels(courante),
        precedent: precedente ? calculerIndicateurs(precedente) : null,
        sansParole,
        sansParolePrecedent,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[stats-appel] calcul en échec :", error);
    return NextResponse.json(
      { error: "Les statistiques n'ont pas pu être calculées. Rechargez la page." },
      { status: 500 },
    );
  }
}

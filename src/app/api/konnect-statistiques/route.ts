export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { PRODUITS } from "@/lib/produits";
import {
  cleCode,
  ouvertureDepuisSemaine,
  ouvertureParDefaut,
  type LigneJour,
} from "@/lib/konnectStatistiques";

/**
 * GET /api/konnect-statistiques?userProductId=NN&from=AAAA-MM-JJ&to=AAAA-MM-JJ
 *     [&prevFrom=AAAA-MM-JJ&prevTo=AAAA-MM-JJ]   (session)
 *
 * Tout ce que montre l'écran « Statistiques » de Konnect, en une lecture (plan workspace
 * `2026-11-statistiques-konnect.md`, lot 2) :
 *
 * - `lignes` : les comptes par jour que Konnect remonte (`KonnectStatJour`), sur la
 *   période et sa période de comparaison, SANS l'OCR ni la lecture (décision D4 : la
 *   mesure de l'OCR reste interne, écartée dans la requête, pas à l'écran) ;
 * - `horaires` : la grille d'ouverture qui sert à compter les RDV pris hors des heures
 *   d'ouverture. Ce sont les horaires de LyraeTalk du même client s'il en a, sinon du
 *   lundi au vendredi de 8 h à 18 h ; Konnect n'a pas de réglage d'horaires ;
 * - `examens` et `sites` : les libellés du centre, avec la clé sous laquelle Konnect
 *   remonte chaque code (`cleCode`) ;
 * - `rappels` et `file` : ce que le Dashboard sait déjà, demandes de rappel et file
 *   d'attente (comptes seulement, aucune donnée patient ne sort d'ici) ;
 * - `funnel` : la dernière remontée du parcours, affichée en bas de l'écran.
 *
 * Jamais 404 : un centre qui n'a encore rien remonté reçoit des listes vides.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOURS_MAX = 800;

function lireDate(v: string | null): string | null {
  if (!v || !DATE.test(v) || Number.isNaN(Date.parse(v))) return null;
  return v;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const userProductId = Number(params.get("userProductId"));
  if (!userProductId || Number.isNaN(userProductId)) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  const from = lireDate(params.get("from"));
  const to = lireDate(params.get("to"));
  if (!from || !to || from > to) {
    return NextResponse.json(
      {
        error:
          "Période invalide : from et to au format AAAA-MM-JJ, from avant to.",
      },
      { status: 400 },
    );
  }
  const prevFrom = lireDate(params.get("prevFrom"));
  const prevTo = lireDate(params.get("prevTo"));
  const depuis = prevFrom && prevFrom < from ? prevFrom : from;
  if ((Date.parse(to) - Date.parse(depuis)) / 86_400_000 > JOURS_MAX) {
    return NextResponse.json(
      { error: "Période trop longue." },
      { status: 400 },
    );
  }

  const ownershipErr = await assertUserProductOwnership(
    auth.session,
    userProductId,
  );
  if (ownershipErr) return ownershipErr;
  const droitErr = await requirePagePermission(PAGES.KONNECT_STATS, "read");
  if (droitErr) return droitErr;

  // Bornes en date ISO castée côté SQL, jamais un objet `Date` (décalage de fuseau).
  const [
    lignes,
    examens,
    sites,
    rappels,
    rappelsAvant,
    file,
    remontee,
    horaires,
  ] = await Promise.all([
    db.query<LigneJour>(
      `SELECT to_char("jour", 'YYYY-MM-DD') AS jour, "cle", "valeur"
           FROM "KonnectStatJour"
          WHERE "userProductId" = $1
            AND "jour" BETWEEN $2::date AND $3::date
            AND "cle" NOT LIKE 'ocr%'
            AND "cle" NOT LIKE 'lecture.%'
          ORDER BY "jour"`,
      [userProductId, depuis, to],
    ),
    db.query<{ examenCode: string; libelle: string; typeCode: string | null }>(
      `SELECT "examenCode", "libelle", "typeCode" FROM "KonnectExamens"
          WHERE "userProductId" = $1`,
      [userProductId],
    ),
    db.query<{ siteId: string; libelle: string | null }>(
      `SELECT "siteId", "libelle" FROM "KonnectSites" WHERE "userProductId" = $1`,
      [userProductId],
    ),
    db.query<{
      recues: string;
      rappelees: string;
      sans_suite: string;
      delai_median_h: number | null;
    }>(
      `SELECT count(*) AS recues,
                count(*) FILTER (WHERE "statut" = 'rappele') AS rappelees,
                count(*) FILTER (WHERE "statut" = 'sans_suite') AS sans_suite,
                percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM ("traiteeAt" - "createdAt")) / 3600
                ) FILTER (WHERE "traiteeAt" IS NOT NULL) AS delai_median_h
           FROM "KonnectDemandesRappel"
          WHERE "userProductId" = $1
            AND ("createdAt" AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date`,
      [userProductId, from, to],
    ),
    db.query<{ recues: string; en_attente: string }>(
      `SELECT count(*) FILTER (
                  WHERE ("createdAt" AT TIME ZONE 'Europe/Paris')::date
                        BETWEEN $2::date AND $3::date
                ) AS recues,
                count(*) FILTER (WHERE "statut" = 'a_rappeler') AS en_attente
           FROM "KonnectDemandesRappel"
          WHERE "userProductId" = $1`,
      [userProductId, prevFrom ?? from, prevTo ?? from],
    ),
    db.query<{
      inscrits: string;
      propositions: string;
      prises: string;
      en_file: string;
    }>(
      `SELECT count(*) FILTER (
                  WHERE ("createdAt" AT TIME ZONE 'Europe/Paris')::date
                        BETWEEN $2::date AND $3::date
                ) AS inscrits,
                coalesce(sum("propositions") FILTER (
                  WHERE ("createdAt" AT TIME ZONE 'Europe/Paris')::date
                        BETWEEN $2::date AND $3::date
                ), 0) AS propositions,
                count(*) FILTER (
                  WHERE "etat" = 'pris_par_la_file'
                    AND ("updatedAt" AT TIME ZONE 'Europe/Paris')::date
                        BETWEEN $2::date AND $3::date
                ) AS prises,
                count(*) FILTER (
                  WHERE "etat" IN ('en_file', 'proposition', 'confirmation_en_cours')
                ) AS en_file
           FROM "KonnectFileAttente"
          WHERE "userProductId" = $1`,
      [userProductId, from, to],
    ),
    db.query<{ charge: { funnel?: unknown } | null; recuAt: Date }>(
      `SELECT "charge", "recuAt" FROM "KonnectRemontee" WHERE "userProductId" = $1`,
      [userProductId],
    ),
    horairesTalk(userProductId),
  ]);

  const r = rappels.rows[0];
  const ra = rappelsAvant.rows[0];
  const f = file.rows[0];
  return NextResponse.json({
    userProductId,
    periode: { from, to, prevFrom, prevTo },
    lignes: lignes.rows,
    horaires,
    examens: examens.rows.map((e) => ({
      code: e.examenCode,
      cle: cleCode(e.examenCode),
      libelle: e.libelle,
      type: e.typeCode,
    })),
    sites: sites.rows.map((s) => ({
      siteId: s.siteId,
      cle: cleCode(s.siteId),
      libelle: s.libelle || s.siteId,
    })),
    rappels: {
      recues: Number(r?.recues ?? 0),
      rappelees: Number(r?.rappelees ?? 0),
      sansSuite: Number(r?.sans_suite ?? 0),
      delaiMedianHeures: r?.delai_median_h ?? null,
      enAttente: Number(ra?.en_attente ?? 0),
      recuesAvant: prevFrom && prevTo ? Number(ra?.recues ?? 0) : null,
    },
    file: {
      inscrits: Number(f?.inscrits ?? 0),
      propositions: Number(f?.propositions ?? 0),
      prises: Number(f?.prises ?? 0),
      enFile: Number(f?.en_file ?? 0),
    },
    funnel: remontee.rows[0]?.charge?.funnel ?? null,
    recuAt: remontee.rows[0]?.recuAt ?? null,
  });
}

/** Les horaires de LyraeTalk du même client, sinon la grille par défaut. */
async function horairesTalk(
  userProductId: number,
): Promise<{ source: "talk" | "defaut"; ouvert: boolean[][] }> {
  const konnect = await prisma.userProduct.findUnique({
    where: { id: userProductId },
    select: { userId: true },
  });
  if (konnect) {
    const talk = await prisma.userProduct.findFirst({
      where: {
        userId: konnect.userId,
        removedAt: null,
        product: { name: PRODUITS.talk.nom },
      },
      select: { id: true },
    });
    if (talk) {
      const reglage = await prisma.talkInformationSettings.findUnique({
        where: { userProductId: talk.id },
        select: { weeklyHours: true },
      });
      const ouvert = ouvertureDepuisSemaine(reglage?.weeklyHours);
      if (ouvert) return { source: "talk", ouvert };
    }
  }
  return { source: "defaut", ouvert: ouvertureParDefaut() };
}

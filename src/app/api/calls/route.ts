// app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { indexerParType, diminutifDuType } from "@/lib/examTypes";
import { requirePagePermission, requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Forme canonique d'un numéro FR pour la comparaison :
 * `+33XXXXXXXXX`, `0033XXXXXXXXX`, `33XXXXXXXXX`, `06XXXXXXXX` →
 * tous normalisés en `06XXXXXXXX`. Permet de matcher quelle que soit la
 * notation saisie par l'utilisateur ou stockée en BDD.
 */
function canonicalPhoneFR(p: string | null | undefined): string {
  if (!p) return "";
  let d = String(p).replace(/[^\d+]/g, "");
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  else if (d.startsWith("0033")) d = "0" + d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = "0" + d.slice(2);
  return d;
}

/**
 * Lit les appels d'un centre, en ne gardant que ceux qui ont plus d'un échange.
 *
 * Avec `sansTranscription`, `steps` n'est jamais ramené : le filtre « plus d'un échange »
 * se fait en SQL, puis la lecture ne sélectionne que les colonnes légères. `steps` vaut
 * `{}` par défaut et non un tableau, d'où le `CASE` (PostgreSQL ne garantit pas l'ordre
 * d'évaluation d'un `AND`, et `jsonb_array_length` échoue sur un objet).
 */
/**
 * `stats.internal` : les mesures que le robot pose sur lui-même (identification, STT,
 * performances d'API). Seul l'écran d'analyse interne les lit, et il a sa propre route.
 *
 * Mesuré en production le 23/09/2026 sur le plus gros centre : cette seule clé pèse les
 * DEUX TIERS de la réponse (7 jours : 5,6 Mo dont 3,7 pour `internal` ; une recherche par
 * téléphone remontait 98 Mo). On ne l'envoie plus aux écrans.
 */
function sansMesuresInternes(ligne: any): any {
  const stats = ligne?.stats;
  if (!stats || typeof stats !== "object" || !("internal" in stats)) return ligne;
  const { internal: _internal, ...reste } = stats as Record<string, unknown>;
  return { ...ligne, stats: reste };
}

/**
 * Rend à ces lignes leur transcription : la liste en affiche les deux premiers échanges.
 * Une requête pour les dix lignes d'une page, au lieu de les traîner sur toute la plage.
 */
async function avecTranscriptions(lignes: any[]): Promise<any[]> {
  if (lignes.length === 0 || lignes[0]?.steps !== undefined) return lignes;
  const steps = await prisma.callConversation.findMany({
    where: { id: { in: lignes.map((c) => c.id) } },
    select: { id: true, steps: true },
  });
  const parId = new Map(steps.map((s) => [s.id, s.steps]));
  return lignes.map((c) => ({ ...c, steps: parId.get(c.id) ?? {} }));
}

async function lireAppels(where: any, sansTranscription: boolean): Promise<any[]> {
  if (!sansTranscription) {
    const lignes = await prisma.callConversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return lignes
      .filter((c: any) => Array.isArray(c.steps) && c.steps.length > 1)
      .map(sansMesuresInternes);
  }

  const depuis: Date = where.createdAt?.gte ?? new Date(0);
  const jusqua: Date = where.createdAt?.lte ?? new Date();
  // Bornes en TEXTE ISO castées en `timestamp`, jamais en objet `Date` : la colonne
  // est un `timestamp without time zone` qui porte de l'UTC, et PostgreSQL lit un
  // paramètre `Date` dans le fuseau du serveur (Europe/Paris). Sans ce cast, deux
  // heures d'appels manquaient à la borne basse, et rien en aval ne les rattrapait
  // (mesuré le 23/09/2026 : 18 lignes sur 7 297).
  const ids = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM "CallConversation"
    WHERE "userProductId" = ${where.userProductId}
      AND "createdAt" >= ${depuis.toISOString()}::timestamp
      AND "createdAt" <= ${jusqua.toISOString()}::timestamp
      AND (CASE WHEN jsonb_typeof(steps::jsonb) = 'array' THEN jsonb_array_length(steps::jsonb) ELSE 0 END) > 1`;
  if (ids.length === 0) return [];

  // Par paquets : PostgreSQL plafonne le nombre de paramètres liés d'une requête.
  const PAQUET = 20000;
  const lignes: any[] = [];
  for (let i = 0; i < ids.length; i += PAQUET) {
    const paquet = ids.slice(i, i + PAQUET).map((r) => r.id);
    lignes.push(
      ...(await prisma.callConversation.findMany({
        where: { ...where, id: { in: paquet } },
        select: {
          id: true,
          userProductId: true,
          centerId: true,
          treated: true,
          flagged: true,
          stats: true,
          createdAt: true,
        },
      }))
    );
  }
  return lignes
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(sansMesuresInternes);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const { searchParams } = request.nextUrl;

    const mode = searchParams.get("mode");
    const examType = searchParams.get("examType");
    const examTypeId = searchParams.get("examTypeId");
    const userProductIdParam = searchParams.get("userProductId");
    const callIdParam = searchParams.get("call");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const statusParam = searchParams.get("status");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const phoneParam = searchParams.get("phone");
    const flaggedParam = searchParams.get("flagged");
    // Optionnel : si fournis, retourne aussi les appels de la période précédente
    // dans le champ `previous` (pour calcul des deltas vs N-1 sur les stats).
    // Les autres filtres (status, examType, …) sont appliqués à l'identique.
    const previousFromParam = searchParams.get("previousFrom");
    const previousToParam = searchParams.get("previousTo");
    const includePrevious = !!(previousFromParam && previousToParam);
    // `champs=stats` : les écrans de statistiques ne lisent que `createdAt` et `stats`.
    // Sans ce paramètre, chaque ligne part avec `steps`, la transcription entière de
    // l'appel, qui pèse l'essentiel de la réponse. Ajout du 18/09/2026 ; sans le
    // paramètre, la réponse est inchangée.
    const sansTranscription = searchParams.get("champs") === "stats";

    // Recherche par numéro de téléphone : on ignore date / status / examType
    // pour rechercher sur la totalité des appels du centre.
    const phoneSearchActive = !!phoneParam && phoneParam.trim().length > 0;
    const flaggedOnly = flaggedParam === "true";

    if (!userProductIdParam) {
      return NextResponse.json(
        { error: "Paramètre userProductId manquant." },
        { status: 400 }
      );
    }

    const userProductId = Number(userProductIdParam);
    if (!Number.isFinite(userProductId)) {
      return NextResponse.json(
        { error: "Paramètre userProductId invalide." },
        { status: 400 }
      );
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

    // ==========================
    // CAS 0 : DES COMPTES, PAS DES LIGNES (`mode=agregat`, 18/09/2026)
    // ==========================
    //
    // L'accueil du produit et la page profil n'ont besoin que de NOMBRES : les tuiles du
    // jour, l'histogramme des quatorze derniers jours, le volume sur trente jours. Ils
    // lisaient pourtant `mode=all`, donc les LIGNES d'appel, nom et date de naissance
    // compris. Pour que l'accueil ne reponde pas 403 a un sous-compte qui n'a que
    // « Tableau de bord », ce droit avait ete ajoute a la lecture des lignes : il
    // suffisait alors de regarder la reponse reseau pour lire les appels du centre.
    //
    // Ce mode rend les memes nombres, calcules ici. Aucune donnee patient ne sort.
    // Les bornes du « jour » viennent du navigateur (`jourDebut`, `jourFin`) : le jour
    // d'une secretaire est celui de son fuseau, pas celui du serveur.
    if (mode === "agregat") {
      const droitAgregatErr = await requireAnyPagePermission(
        [PAGES.DASHBOARD, PAGES.CALLS, PAGES.INCIDENTS, PAGES.STATS_APPEL],
        "read"
      );
      if (droitAgregatErr) return droitAgregatErr;

      const versDate = (brut: string | null): Date | null => {
        if (!brut) return null;
        const d = new Date(brut);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const jourDebut = versDate(searchParams.get("jourDebut"));
      const jourFin = versDate(searchParams.get("jourFin"));
      const depuis = versDate(fromParam);
      const jusqua = versDate(toParam);

      let jour: { total: number; urgences: number; rdvPris: number; indice: number } | null = null;
      if (jourDebut && jourFin) {
        const duJour = await prisma.callConversation.findMany({
          where: { userProductId, createdAt: { gte: jourDebut, lte: jourFin } },
          select: { stats: true },
        });
        let urgences = 0;
        let rdvPris = 0;
        let enErreur = 0;
        for (const c of duJour) {
          const stats = (c.stats ?? {}) as Record<string, any>;
          const e = stats.emergency;
          if (
            e === true ||
            e === "true" ||
            e === 1 ||
            (Array.isArray(e) && e.length > 0) ||
            (typeof e === "object" && e !== null && !Array.isArray(e))
          ) {
            urgences += 1;
          }
          const pris = Number(stats.rdv_booked);
          if (Number.isFinite(pris) && pris !== 0) rdvPris += pris;
          if (Number(stats.error_logic) > 0) enErreur += 1;
        }
        jour = {
          total: duJour.length,
          urgences,
          rdvPris,
          indice: duJour.length === 0 ? 0 : Math.floor((1 - enErreur / duJour.length) * 100),
        };
      }

      // Les quatorze derniers jours QUI ONT DES APPELS, comme le faisait l'ecran : un
      // jour sans appel n'y figure pas. Jour calendaire UTC, idem.
      const parJourBrut = await prisma.$queryRaw<{ iso: string; total: number }[]>`
        SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS iso, count(*)::int AS total
        FROM "CallConversation"
        WHERE "userProductId" = ${userProductId}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 14
      `;

      const total =
        depuis || jusqua
          ? await prisma.callConversation.count({
              where: {
                userProductId,
                createdAt: { ...(depuis ? { gte: depuis } : {}), ...(jusqua ? { lte: jusqua } : {}) },
              },
            })
          : null;

      return NextResponse.json({ jour, parJour: [...parJourBrut].reverse(), total });
    }

    // TROIS ecrans lisent les LIGNES d'appel : Appels, Incidents et Statistiques
    // d'appels. Exiger la seule page « Appels » couperait un sous-compte qui n'a
    // legitimement qu'« Incidents ».
    //
    // « Tableau de bord » n'y figure PLUS (18/09/2026). Il y avait ete ajoute le 16/09
    // parce que l'accueil lisait cette route et affichait zero partout sur un 403. Il
    // lit desormais `mode=agregat`, ci-dessus : cocher « Tableau de bord » a un
    // sous-compte ne lui donne plus les appels du centre.
    const droitErr = await requireAnyPagePermission(
      [PAGES.CALLS, PAGES.INCIDENTS, PAGES.STATS_APPEL],
      "read"
    );
    if (droitErr) return droitErr;

    // ==========================
    // CAS 1 : UN SEUL CALL
    // ==========================
    if (callIdParam) {
      const callId = Number(callIdParam);

      if (!Number.isFinite(callId)) {
        return NextResponse.json(
          { error: "Paramètre call invalide." },
          { status: 400 }
        );
      }

      const call = await prisma.callConversation.findFirst({
        where: { id: callId, userProductId },
      });

      if (!call) {
        return NextResponse.json(
          { error: "Aucun appel trouvé." },
          { status: 404 }
        );
      }

      return NextResponse.json([call], { status: 200 });
    }

    // ==========================
    // LISTE DES CALLS
    // ==========================

    const whereClause: any = {
      userProductId,
      AND: [
        {
          stats: {
            path: ["duration"],
            gt: 15,
          },
        },
      ],
    };

    if (flaggedOnly) {
      whereClause.flagged = true;
    }

    // ==========================
    // Filtre date
    // ==========================
    if (fromParam || toParam) {
      const dateFilter: any = {};

      if (fromParam) {
        dateFilter.gte = new Date(fromParam);
      }

      if (toParam) {
        dateFilter.lte = new Date(toParam);
      }

      whereClause.createdAt = dateFilter;
    }

    // Filtre statut
    if (statusParam && statusParam !== "all") {
      if (statusParam.startsWith("transfer:")) {
        const reason = statusParam.slice("transfer:".length);
        if (reason === "all") {
          whereClause.AND.push({
            stats: { path: ["end_reason"], equals: "transfer" },
          });
        } else {
          whereClause.AND.push({
            stats: { path: ["transferReason"], equals: reason },
          });
        }
      } else if (
        statusParam === "not_performed" ||
        statusParam === "no_slot_api_retrieve"
      ) {
        // Filtrés en JS post-fetch (cf. plus bas) pour garantir une logique
        // strictement identique à la page Statistiques d'appels.
        // — `not_performed`        → stats.transferReason === "exam_type"
        // — `no_slot_api_retrieve` → stats.no_slot_api_retrieve truthy
      } else if (statusParam === "hung_up") {
        whereClause.AND.push({
          AND: [
            { stats: { path: ["rdv_booked"], equals: 0 } },
            { stats: { path: ["rdv_canceled"], equals: 0 } },
            { stats: { path: ["rdv_modified"], equals: 0 } },
            {
              NOT: {
                stats: { path: ["end_reason"], equals: "transfer" },
              },
            },
          ],
        });
      } else if (statusParam === "rescheduled") {
        whereClause.AND.push({
          stats: {
            path: ["rdv_modified"],
            gt: 0,
          },
        });
      } else if (statusParam === "canceled") {
        whereClause.AND.push({
          stats: {
            path: ["rdv_canceled"],
            gt: 0,
          },
        });
      } else {
        whereClause.AND.push({
          stats: {
            path: ["rdv_status"],
            equals: statusParam,
          },
        });
      }
    }

        // La liste des appels n'affiche qu'une page de dix lignes, mais le filtrage se
        // fait encore en mémoire : on lit toute la plage SANS les transcriptions, et on
        // ne les charge que pour les lignes retenues (plus bas). Avant le 23/09/2026 la
        // plage entière partait avec ses transcriptions, et une recherche par téléphone
        // (cinq ans) en chargeait 14 Mo pour en afficher dix.
        const modePagine = mode !== "all";
        let calls: any[] = await lireAppels(whereClause, sansTranscription || modePagine);

    if (statusParam === "hung_up") {
      calls = calls.filter((c: any) => {
        const s = c.stats || {};
        const hasRdvStatus = !!s.rdv_status;
        const hasRenseignements =
          Array.isArray(s.intents) && s.intents.includes("renseignements");
        return !hasRdvStatus && !hasRenseignements;
      });
    }

    if (statusParam === "no_slot_api_retrieve") {
      calls = calls.filter((c: any) => !!c?.stats?.no_slot_api_retrieve);
    }

    if (statusParam === "not_performed") {
      calls = calls.filter((c: any) => c?.stats?.transferReason === "exam_type");
    }

    // Recherche numéro — match canonique (06... ↔ +336...)
    if (phoneSearchActive) {
      const needle = canonicalPhoneFR(phoneParam);
      if (needle) {
        calls = calls.filter((c: any) => {
          const stored = canonicalPhoneFR(c?.stats?.phoneNumber);
          return stored.includes(needle);
        });
      }
    }

    // ==========================
    // MODE ALL → pas de pagination
    // ==========================
    if (mode === "all") {
      // Si la page demande une comparaison (deltas vs N-1), on fait un 2e
      // fetch sur la période précédente avec EXACTEMENT les mêmes filtres
      // (whereClause cloné + range remplacé + mêmes post-filtres JS).
      if (includePrevious) {
        const previousWhere: any = {
          ...whereClause,
          createdAt: {
            gte: new Date(previousFromParam!),
            lte: new Date(previousToParam!),
          },
        };
        // Reproduire les filtres post-fetch JS identiquement.
        let previousCalls: any[] = await lireAppels(previousWhere, sansTranscription);
        if (statusParam === "hung_up") {
          previousCalls = previousCalls.filter((c: any) => {
            const s = c.stats || {};
            const hasRdvStatus = !!s.rdv_status;
            const hasRenseignements =
              Array.isArray(s.intents) && s.intents.includes("renseignements");
            return !hasRdvStatus && !hasRenseignements;
          });
        }
        if (statusParam === "no_slot_api_retrieve") {
          previousCalls = previousCalls.filter(
            (c: any) => !!c?.stats?.no_slot_api_retrieve
          );
        }
        if (statusParam === "not_performed") {
          previousCalls = previousCalls.filter(
            (c: any) => c?.stats?.transferReason === "exam_type"
          );
        }
        if (phoneSearchActive) {
          const needle = canonicalPhoneFR(phoneParam);
          if (needle) {
            previousCalls = previousCalls.filter((c: any) => {
              const stored = canonicalPhoneFR(c?.stats?.phoneNumber);
              return stored.includes(needle);
            });
          }
        }

        return NextResponse.json(
          { data: calls, previous: previousCalls },
          { status: 200 }
        );
      }
      return NextResponse.json(calls, { status: 200 });
    }

    // ==========================
    // MODE PAGINÉ
    // ==========================
    const page = Number(pageParam) || 1;
    const limit = Number(limitParam) || 10;
    const skip = (page - 1) * limit;

    // Filtre par exam_type_id spécifique
    if (examTypeId && examTypeId !== "all") {
      calls = calls.filter((call: any) => {
        const id = call.stats?.exam_type_id;
        if (!id) return false;
        if (Array.isArray(id)) return id.includes(examTypeId);
        return id === examTypeId;
      });
    }

    const total = calls.length;
    const paginatedCalls = await avecTranscriptions(calls.slice(skip, skip + limit));

    if (examType) {
      // `stats.exam_type_id` porte le code du LOGICIEL DU CENTRE, pas le code
      // canonique : Le Creusot écrit "SC" pour un scanner et "IR" pour une IRM.
      // Comparer en dur à "CT" et "MR" ne renvoyait donc rien chez tout centre
      // ayant ses propres codes. On résout les diminutifs du centre, en gardant
      // les codes canoniques au cas où le centre n'aurait rien personnalisé.
      // On lit les cinq lignes plutot que de filtrer sur examCode en base :
      // l'examCode peut etre hors nomenclature (le script de provisionnement de
      // Pontivy y met le code du RIS), et indexerParType retrouve le type.
      const mappingCentre = await prisma.examMapping.findMany({
        where: { userProductId },
        select: { examCode: true, fr: true, labelFr: true, diminutif: true },
      });
      const parType = indexerParType(mappingCentre);
      const codesScannerIrm = new Set<string>([
        "CT",
        "MR",
        diminutifDuType(parType, "CT"),
        diminutifDuType(parType, "MR"),
      ]);

      const scannersCalls = calls.filter((call: any) => {
        const id = call.stats?.exam_type_id;
        if (!id) return false;
        const codes = Array.isArray(id) ? id : [id];
        return codes.some((c: unknown) => codesScannerIrm.has(String(c)));
      });
      const examPaginatedCalls = await avecTranscriptions(scannersCalls.slice(skip, skip + limit));

      return NextResponse.json(
        {
          data: examPaginatedCalls,
          total: scannersCalls.length,
          page,
          limit
        }
      );
    } else {
      return NextResponse.json(
        {
          data: paginatedCalls,
          total,
          page,
          limit,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Erreur fetching calls:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue." },
      { status: 500 }
    );
  }
}

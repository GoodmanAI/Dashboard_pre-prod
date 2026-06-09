import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/planning-complet/aggregate?userProductId=X&from=ISO&to=ISO
 *
 * Agrège les appels qui ont rencontré au moins un "0 créneau" sur la période.
 *
 * Champs source (à la racine de stats, PAS dans stats.internal) :
 *  - stats.no_slot_api_retrieve : string (ris_code de l'examen qui a déclenché
 *    le 0 créneau). Absent si l'appel n'a jamais rencontré ce cas.
 *  - stats.rdv_status : qualifie l'issue —
 *      'full_planning_redirect' / 'full_planning_end' = planning complet confirmé
 *      'no_slot'                                       = 0 créneau à investiguer
 *                                                        (manque réel OU code mal
 *                                                        paramétré, ambigu)
 *
 * Réponse :
 *  - period, totals
 *  - rdvStatusDistribution : {full_planning_redirect, full_planning_end, no_slot}
 *  - confirmed.items : codes les plus rencontrés en planning complet "propre"
 *  - toInvestigate.items : codes en 'no_slot' (à investiguer côté config)
 *  - timeseries : tendance par jour des 2 catégories
 *
 * Limites connues (du bot) :
 *  - Un seul code par appel (no_slot_api_retrieve est réécrit à chaque
 *    recherche). Pas d'exhaustivité intra-appel.
 *  - Le flow double-booking ne renseigne pas ce champ.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const { searchParams } = req.nextUrl;
    const userProductIdParam = searchParams.get("userProductId");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (!userProductIdParam) {
      return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
    }
    const userProductId = Number(userProductIdParam);
    if (!Number.isFinite(userProductId)) {
      return NextResponse.json({ error: "Invalid userProductId" }, { status: 400 });
    }

    const ownershipErr = await assertUserProductOwnership(session, userProductId);
    if (ownershipErr) return ownershipErr;

    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : new Date();

    // Charge en parallèle : (1) les appels de la période, (2) le mapping
    // ris_code → libellé via TalkSettings.exams (clé `codeExamenClient` =
    // ris_code envoyé par le bot, valeur `libelle` = nom human-readable).
    const [calls, talkSettings] = await Promise.all([
      prisma.callConversation.findMany({
        where: {
          userProductId,
          createdAt: { gte: from, lte: to },
        },
        select: { id: true, createdAt: true, stats: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.talkSettings.findUnique({
        where: { userProductId },
        select: { exams: true },
      }),
    ]);

    // Construit le map { codeExamenClient: libelle } depuis TalkSettings.exams.
    // Le champ peut être array ou object selon les sites (cf. /api/configuration/get/mapping).
    const labelByCode: Record<string, string> = {};
    if (talkSettings?.exams) {
      const exams =
        typeof talkSettings.exams === "string"
          ? JSON.parse(talkSettings.exams)
          : talkSettings.exams;
      const iterable = Array.isArray(exams)
        ? exams
        : typeof exams === "object" && exams !== null
        ? Object.values(exams)
        : [];
      for (const e of iterable as any[]) {
        if (!e || typeof e !== "object") continue;
        const code = e.codeExamenClient;
        // Préférence : libelleClient (sémantique "côté client") si défini,
        // sinon libelle (le neuracorp).
        const label = e.libelleClient || e.libelle;
        if (code && label && !labelByCode[code]) labelByCode[code] = label;
      }
    }

    type Bucket = {
      examCode: string;
      /** Libellé résolu via TalkSettings.exams (sinon = examCode). */
      label: string;
      count: number;
      lastCallAt: string;
      lastCallId: number;
    };

    const confirmedBuckets = new Map<string, Bucket>();
    const investigateBuckets = new Map<string, Bucket>();
    const rdvStatusDistribution: Record<string, number> = {
      full_planning_redirect: 0,
      full_planning_end: 0,
      no_slot: 0,
    };

    // Timeseries par jour (local time, cf. analytics-internal pour le pattern).
    const dayKey = (d: Date | string) => {
      const date = new Date(d);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    type DayBucket = { confirmed: number; toInvestigate: number };
    const byDay = new Map<string, DayBucket>();

    for (const c of calls) {
      const stats = (c.stats as any) || {};
      const code = stats.no_slot_api_retrieve;
      // Le champ contient soit un ris_code (string non vide), soit est absent.
      // On tolère le legacy `true` ou autres valeurs truthy non-string en les
      // bucketant comme "Sans code" (rétrocompat avec les anciens enregistrements).
      if (!code) continue;

      const examCode = typeof code === "string" && code.trim() !== "" ? code.trim() : "__unknown__";
      const status = stats.rdv_status as string | undefined;
      const iso = new Date(c.createdAt).toISOString();

      // Catégorisation :
      //  - 'full_planning_redirect' / 'full_planning_end' → planning complet confirmé
      //  - 'no_slot'                                       → à investiguer
      //  - autres / undefined                             → ignorés (cas ambigu, ex. l'appel
      //                                                      a continué après le no_slot)
      const isConfirmed =
        status === "full_planning_redirect" || status === "full_planning_end";
      const isInvestigate = status === "no_slot";

      if (!isConfirmed && !isInvestigate) continue;

      if (status && status in rdvStatusDistribution) rdvStatusDistribution[status]++;

      const targetMap = isConfirmed ? confirmedBuckets : investigateBuckets;
      const existing = targetMap.get(examCode);
      if (existing) {
        existing.count++;
      } else {
        targetMap.set(examCode, {
          examCode,
          label: labelByCode[examCode] || examCode,
          count: 1,
          lastCallAt: iso,
          lastCallId: c.id,
        });
      }

      // Timeseries
      const k = dayKey(c.createdAt);
      if (!byDay.has(k)) byDay.set(k, { confirmed: 0, toInvestigate: 0 });
      const slot = byDay.get(k)!;
      if (isConfirmed) slot.confirmed++;
      else slot.toInvestigate++;
    }

    const sortByCountDesc = (a: Bucket, b: Bucket) => b.count - a.count;
    const confirmedItems = Array.from(confirmedBuckets.values()).sort(sortByCountDesc);
    const investigateItems = Array.from(investigateBuckets.values()).sort(sortByCountDesc);

    // Génère un point par jour de la fenêtre (continuité, même 0).
    const timeseries: { date: string; dayLabel: string; confirmed: number; toInvestigate: number }[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setHours(0, 0, 0, 0);
    while (cursor <= endDay) {
      const k = dayKey(cursor);
      const d = byDay.get(k);
      timeseries.push({
        date: k,
        dayLabel: cursor.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        confirmed: d?.confirmed ?? 0,
        toInvestigate: d?.toInvestigate ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const confirmedTotal = confirmedItems.reduce((s, b) => s + b.count, 0);
    const investigateTotal = investigateItems.reduce((s, b) => s + b.count, 0);

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      total: confirmedTotal + investigateTotal,
      rdvStatusDistribution,
      confirmed: { total: confirmedTotal, items: confirmedItems },
      toInvestigate: { total: investigateTotal, items: investigateItems },
      timeseries,
    });
  } catch (err) {
    console.error("Error in planning-complet/aggregate:", err);
    return NextResponse.json({ error: "Failed to aggregate" }, { status: 500 });
  }
}

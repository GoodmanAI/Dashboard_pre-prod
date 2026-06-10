import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/exam-non-pris/aggregate?userProductId=X&from=ISO&to=ISO
 *
 * Agrège les appels où le bot a redirigé le patient parce que l'examen n'est
 * pas réalisé par le site. Deux cas distincts :
 *
 *  CAS A — Code examen précis non pris en charge :
 *    transferReason === 'exam_not_practiced'
 *    avec stats.exam_not_practiced_code (clé d'agrégation),
 *         stats.exam_not_practiced_type (modalité : RX/US/MG/CT/MR),
 *         stats.exam_not_practiced_label (libellé si dispo, souvent null).
 *    → Indicateur d'action #1 : codes candidats à ajouter au mapping du site.
 *
 *  CAS B — Type entier non réalisé :
 *    transferReason === 'exam_type' OU stats.exam_not_bookable === true
 *    avec stats.exam_not_bookable_type (RX/US/MG/CT/MR).
 *    → Validation cohérence config : type volontairement refusé ou erreur ?
 *
 * Limites :
 *  - Champs optionnels (absents sur la majorité des appels) — gérés sans
 *    fausser les compteurs.
 *  - Un seul examen par appel (dernier ayant déclenché la redirection).
 *  - À ne pas confondre avec planning complet (no_slot_api_retrieve).
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

    // Fetch appels + mapping en parallèle. Mapping = TalkSettings.exams :
    // on indexe sur `codeExamen` ET `codeExamenClient` pour maximiser le match
    // (le bot peut envoyer l'un ou l'autre selon la source du RIS).
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
        const label = e.libelle || e.libelleClient;
        if (!label) continue;
        // Codes standards
        if (e.codeExamen && !labelByCode[e.codeExamen]) labelByCode[e.codeExamen] = label;
        if (e.codeExamenClient && !labelByCode[e.codeExamenClient]) {
          labelByCode[e.codeExamenClient] = label;
        }
        // Code "avec injection" (IRM/Scanner injectés) : libellé suffixé pour
        // distinguer visuellement de la version standard.
        if (e.codeExamenClientInject && !labelByCode[e.codeExamenClientInject]) {
          labelByCode[e.codeExamenClientInject] = `${label} (avec injection)`;
        }
      }
    }

    // ---------- Accumulateurs ----------
    type CodeBucket = {
      examCode: string;
      label: string;
      type: string | null;
      count: number;
      lastCallAt: string;
      lastCallId: number;
    };
    type TypeBucket = {
      type: string;
      count: number;
      lastCallAt: string;
      lastCallId: number;
    };

    // Cas A : codes précis non pris en charge
    const codeBuckets = new Map<string, CodeBucket>();
    /** Compteur par modalité (RX / US / MG / CT / MR / unknown) sur cas A. */
    const typeDistribution: Record<string, number> = {};

    // Cas B : types entiers refusés
    const bookableTypeBuckets = new Map<string, TypeBucket>();

    // Timeseries par jour : 2 séries (codes + types entiers).
    const dayKey = (d: Date | string) => {
      const date = new Date(d);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    type DayBucket = { codes: number; types: number };
    const byDay = new Map<string, DayBucket>();

    for (const c of calls) {
      const stats = (c.stats as any) || {};
      const reason = stats.transferReason as string | undefined;
      const iso = new Date(c.createdAt).toISOString();

      // --- Cas A : exam_not_practiced ---
      if (reason === "exam_not_practiced") {
        const rawCode = stats.exam_not_practiced_code;
        const examCode =
          typeof rawCode === "string" && rawCode.trim() !== "" ? rawCode.trim() : "__unknown__";
        const type =
          typeof stats.exam_not_practiced_type === "string" && stats.exam_not_practiced_type
            ? stats.exam_not_practiced_type
            : null;
        // Priorité : label envoyé par le bot > mapping local > code brut.
        const botLabel =
          typeof stats.exam_not_practiced_label === "string" && stats.exam_not_practiced_label
            ? stats.exam_not_practiced_label
            : null;
        const label = botLabel || labelByCode[examCode] || examCode;

        const existing = codeBuckets.get(examCode);
        if (existing) {
          existing.count++;
          // On garde le 1er type rencontré (Prisma orderBy desc → c'est le plus récent).
          // Si l'existing n'avait pas de type et le nouveau en a, on hydrate.
          if (!existing.type && type) existing.type = type;
        } else {
          codeBuckets.set(examCode, {
            examCode,
            label,
            type,
            count: 1,
            lastCallAt: iso,
            lastCallId: c.id,
          });
        }

        // Distribution par type (modalité)
        const typeKey = type ?? "unknown";
        typeDistribution[typeKey] = (typeDistribution[typeKey] ?? 0) + 1;

        // Timeseries
        const k = dayKey(c.createdAt);
        if (!byDay.has(k)) byDay.set(k, { codes: 0, types: 0 });
        byDay.get(k)!.codes++;
        continue;
      }

      // --- Cas B : exam_type ou exam_not_bookable === true ---
      const isBookableRefuse =
        reason === "exam_type" || stats.exam_not_bookable === true;
      if (isBookableRefuse) {
        const rawType = stats.exam_not_bookable_type;
        const type =
          typeof rawType === "string" && rawType.trim() !== "" ? rawType.trim() : "__unknown__";

        const existing = bookableTypeBuckets.get(type);
        if (existing) {
          existing.count++;
        } else {
          bookableTypeBuckets.set(type, {
            type,
            count: 1,
            lastCallAt: iso,
            lastCallId: c.id,
          });
        }

        const k = dayKey(c.createdAt);
        if (!byDay.has(k)) byDay.set(k, { codes: 0, types: 0 });
        byDay.get(k)!.types++;
      }
    }

    const sortByCountDesc = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
    const codeItems = Array.from(codeBuckets.values()).sort(sortByCountDesc);
    const bookableTypeItems = Array.from(bookableTypeBuckets.values()).sort(sortByCountDesc);

    // Timeseries continu (1 point par jour, 0 si pas de data).
    const timeseries: { date: string; dayLabel: string; codes: number; types: number }[] = [];
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
        codes: d?.codes ?? 0,
        types: d?.types ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const codesTotal = codeItems.reduce((s, b) => s + b.count, 0);
    const typesTotal = bookableTypeItems.reduce((s, b) => s + b.count, 0);

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      total: codesTotal + typesTotal,
      codes: { total: codesTotal, items: codeItems },
      bookableTypes: { total: typesTotal, items: bookableTypeItems },
      typeDistribution,
      timeseries,
    });
  } catch (err) {
    console.error("Error in exam-non-pris/aggregate:", err);
    return NextResponse.json({ error: "Failed to aggregate" }, { status: 500 });
  }
}

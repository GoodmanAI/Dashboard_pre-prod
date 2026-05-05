// app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";

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

    
    // 🔹 Une seule requête DB
    let calls = await prisma.callConversation.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // 🔹 Filtre JS obligatoire
    calls = calls.filter((c: any) => {
      return Array.isArray(c.steps) && c.steps.length > 1;
    });

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
    const paginatedCalls = calls.slice(skip, skip + limit);

    if (examType) {
      const scannersCalls = calls.filter((call: any) => {
        if(call.stats?.exam_type_id === null) return false;
        return call.stats?.exam_type_id?.includes("CT") || call.stats?.exam_type_id?.includes("MR");
      });

      console.log(scannersCalls.length, "calls de type scanner/IRM");
      const examPaginatedCalls = scannersCalls.slice(skip, skip + limit);

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

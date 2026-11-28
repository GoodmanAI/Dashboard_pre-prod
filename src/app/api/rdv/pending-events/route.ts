import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

const MAX_BATCH = 200;

/**
 * Appelé en polling par l'API métier AI2Xplore (sortie internet depuis le VPN)
 * pour récupérer les RDV traités par le patient (ou passés à EXPIRED / LOCKED)
 * qui n'ont pas encore été acquittés.
 *
 * Query params :
 *   - `limit` : 1..200 (défaut 100)
 *   - `externalCenterCode` : filtre par code centre côté métier.
 *     Accepte une valeur unique ou une liste CSV (ex: "N01,MEN,A04").
 *     Filtre appliqué sur `AppointmentConfirmation.externalCenterCode`
 *     (stocké à l'init, pas de re-lookup ici).
 *   - `userProductId` : filtre par UserProduct interne dashboard.
 *     Accepte une valeur unique ou une liste CSV (ex: "2,15,12").
 *     Résolu vers `centerId` via ExternalCenterMapping → UserProduct.userId.
 *
 *   - `apresId` (28/11/2026) : ne rend que les events placés APRÈS celui-ci dans l'ordre de
 *     la file. Le poller d'AI2Xplore lit ainsi toute la file en une passe, même quand il laisse
 *     des events non acquittés en tête (réessai, autre instance) : avant, 100 events non
 *     acquittables arrêtaient chaque passe (panne de l'été 2026). Un id inconnu ne filtre rien.
 *
 * Combiner les filtres est autorisé (intersection).
 *
 * Réponse :
 * {
 *   count: <events dans cette page>,
 *   total: <total en attente matching le filtre, curseur NON compris>,
 *   hasMore: <il reste au moins un event après cette page, curseur compris>,
 *   events: [...]
 * }
 *
 * Ordre : `createdAt ASC, id ASC` (FIFO stricte, stable). Garantit qu'aucun
 * event ne peut être « noyé » sous des events plus récents même si la file
 * dépasse `limit` — les plus anciens ressortent en premier à chaque poll.
 */
export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "APPOINTMENT_API_KEY");
  if (keyErr) return keyErr;

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "100", 10) || 100, 1),
    MAX_BATCH
  );

  // ---- Parsing des filtres (chacun peut être une CSV) ----
  const externalCenterCodes = parseCsvParam(
    req.nextUrl.searchParams.get("externalCenterCode")
  );

  const userProductIdsRaw = parseCsvParam(
    req.nextUrl.searchParams.get("userProductId")
  );
  const userProductIds = userProductIdsRaw
    ? userProductIdsRaw
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : null;

  // Un userProductId côté dashboard = un UserProduct = un utilisateur (centre)
  // via UserProduct.userId. Les events sont stockés avec `centerId` (= User.id
  // du centre). On résout donc `userProductId → centerId` avant le filtre.
  let centerIds: number[] | null = null;
  if (userProductIds && userProductIds.length > 0) {
    const centersRes = await db.query<{ userId: number }>(
      `SELECT "userId" FROM "UserProduct"
        WHERE "id" = ANY($1::int[])
          AND "removedAt" IS NULL`,
      [userProductIds]
    );
    centerIds = centersRes.rows.map((r) => r.userId);
    // Si aucun UserProduct valide → réponse vide (pas d'erreur pour rester
    // simple côté client).
    if (centerIds.length === 0) {
      return NextResponse.json({ count: 0, total: 0, hasMore: false, events: [] });
    }
  }

  // Passe les PENDING expirés en EXPIRED AVANT la lecture, pour qu'ils
  // remontent immédiatement dans la file d'events à traiter.
  await db.query(
    `UPDATE "AppointmentConfirmation"
        SET "status" = 'EXPIRED'
      WHERE "status" = 'PENDING' AND "expiresAt" < NOW()`
  );

  // Construction dynamique du WHERE. Chaque filtre ajoute une clause + un
  // binding. On garde une seule query (pas de branches dupliquées).
  const conditions: string[] = [
    `"status" IN ('CONFIRMED', 'CANCELLED', 'EXPIRED', 'LOCKED')`,
    `"ackedAt" IS NULL`,
  ];
  const bindings: any[] = [];
  let idx = 1;

  if (externalCenterCodes && externalCenterCodes.length > 0) {
    conditions.push(`"externalCenterCode" = ANY($${idx}::text[])`);
    bindings.push(externalCenterCodes);
    idx++;
  }
  if (centerIds && centerIds.length > 0) {
    conditions.push(`"centerId" = ANY($${idx}::int[])`);
    bindings.push(centerIds);
    idx++;
  }

  const whereClause = conditions.join(" AND ");

  // Curseur : hors du total (qui reste « tout ce qui attend »), dans la page seulement.
  const apresIdRaw = parseInt(req.nextUrl.searchParams.get("apresId") ?? "", 10);
  const apresId = Number.isInteger(apresIdRaw) && apresIdRaw > 0 ? apresIdRaw : null;
  const pageConditions = [...conditions];
  const pageBindings = [...bindings];
  let pageIdx = idx;
  if (apresId != null) {
    // Un id absent de la table rendrait NULL à la comparaison, donc une page vide : il ne filtre rien.
    pageConditions.push(
      `(NOT EXISTS (SELECT 1 FROM "AppointmentConfirmation" c WHERE c."id" = $${pageIdx})
        OR ("createdAt", "id") > (SELECT c."createdAt", c."id" FROM "AppointmentConfirmation" c WHERE c."id" = $${pageIdx}))`
    );
    pageBindings.push(apresId);
    pageIdx++;
  }

  // 1) Total en attente matching le filtre (utile pour AI2Xplore pour boucler).
  const totalRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count"
       FROM "AppointmentConfirmation"
      WHERE ${whereClause}`,
    bindings
  );
  const total = parseInt(totalRes.rows[0]?.count ?? "0", 10);

  // 2) Page d'events, FIFO stricte (createdAt ASC + id ASC pour stabilité).
  const eventsRes = await db.query<{
    id: number;
    rdvId: string;
    status: string;
    respondedAction: string | null;
    respondedAt: Date | null;
    attempts: number;
    externalCenterCode: string | null;
    appointmentDate: Date | null;
    createdAt: Date;
  }>(
    // `appointmentDate` (16/11/2026) : AI2Xplore distingue une réponse à un RDV passé (rien à
    // faire) d'une réponse à un RDV à venir dont il a perdu la relance (à reprendre à la main).
    `SELECT "id", "rdvId", "status", "respondedAction",
            "respondedAt", "attempts", "externalCenterCode", "appointmentDate", "createdAt"
       FROM "AppointmentConfirmation"
      WHERE ${pageConditions.join(" AND ")}
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT $${pageIdx}`,
    // Une ligne de plus que la page : dit s'il reste une suite, curseur compris.
    [...pageBindings, limit + 1]
  );
  const events = eventsRes.rows.slice(0, limit);

  return NextResponse.json({
    count: events.length,
    total,
    hasMore: eventsRes.rows.length > limit,
    events,
  });
}

/**
 * Parse un query param CSV : trim + drop empty + dédup. Retourne null si le
 * param est absent ou vide (aucun filtre à appliquer).
 */
function parseCsvParam(raw: string | null): string[] | null {
  if (!raw) return null;
  const arr = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  );
  return arr.length > 0 ? arr : null;
}

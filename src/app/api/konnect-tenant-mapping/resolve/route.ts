export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";

/**
 * Résolution `tenant_id` → `userProductId`, pour Konnect (lot A).
 *
 * **Pourquoi une route à part.** La route parente `/api/konnect-tenant-mapping`
 * administre la correspondance : elle est réservée à une session admin, liste
 * *tous* les centres, et son en-tête dit qu'elle ne doit jamais rejoindre
 * `PUBLIC_API_PATTERNS`. Ce qu'il faut ici est l'inverse : une surface
 * machine-à-machine minuscule, qui répond à une seule question et ne renvoie
 * qu'un entier.
 *
 * **À quoi elle sert.** Konnect s'identifiait jusqu'ici par son `tenant_id`, que
 * le Dashboard traduisait à *chaque* lecture de configuration. LyraeTalk, lui,
 * connaît son `userProductId` et appelle directement
 * `GET /api/configuration?userProductId=NN`. Konnect appelle désormais cette
 * route **une fois**, retient le résultat, et interroge ensuite le Dashboard
 * comme LyraeTalk. Une seule forme d'appel pour les deux produits — donc une
 * seule forme pour toutes les futures routes de configuration, sans traduction à
 * refaire à chaque domaine migré.
 *
 * `tenant_id` reste la clé d'isolation RLS de Konnect ; il disparaît simplement
 * des routes de configuration.
 *
 * **Clé API uniquement**, pas `requireAuthOrApiKey` : accepter une session
 * ouvrirait la résolution à n'importe quel compte client, alors que la question
 * n'est posée que par une brique. Route à ajouter à `PUBLIC_API_PATTERNS` de
 * `src/middleware.ts`, sans quoi le middleware renvoie 401 avant le handler.
 *
 *  GET /api/konnect-tenant-mapping/resolve?tenantId=<uuid>
 *    → 200 { userProductId }
 *    → 404 si aucun centre actif n'est rattaché à ce cabinet
 */

/** Forme canonique d'un UUID — évite un 22P02 Postgres sur une saisie libre. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const keyErr = requireApiKey(req, "KONNECT_API_KEY");
  if (keyErr) return keyErr;

  const tenantId = (req.nextUrl.searchParams.get("tenantId") ?? "").trim().toLowerCase();
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "tenantId doit être un UUID" }, { status: 400 });
  }

  // `removedAt IS NULL` : un centre dont le produit a été retiré ne doit plus
  // résoudre. La ligne de mapping survit au retrait (l'historique est conservé),
  // donc le filtre est ici, pas dans la table.
  const res = await db.query<{ userProductId: number }>(
    `SELECT m."userProductId"
       FROM "KonnectTenantMapping" m
       JOIN "UserProduct" up ON up."id" = m."userProductId"
      WHERE m."tenantId" = $1::uuid
        AND up."removedAt" IS NULL
      LIMIT 1`,
    [tenantId]
  );

  if (res.rowCount === 0) {
    // Cabinet non rattaché : ce n'est pas une panne, c'est l'état normal d'un
    // cabinet non encore migré. Konnect le traite comme tel et garde sa
    // configuration locale.
    return NextResponse.json(
      { error: "Aucun centre rattaché à ce tenant" },
      { status: 404 }
    );
  }

  return NextResponse.json({ userProductId: res.rows[0].userProductId });
}

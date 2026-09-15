export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";

/**
 * GET /api/konnect-tenants-attendus — les cabinets que le Dashboard attend (lot 4E).
 *
 * ## Ce que ça referme
 *
 * L'identifiant de cabinet du portail naissait chez Konnect : on créait le cabinet par
 * `POST /console/cabinets` en curl, on relevait l'UUID rendu par sa base, on le
 * recopiait à la main dans l'écran « Identifiants externes ». Deux outils, un
 * copier-coller, et un Dashboard qui écrivait lui-même sur cet écran qu'il ne pouvait
 * pas vérifier que l'UUID saisi désignait quoi que ce soit.
 *
 * Le Dashboard attribue maintenant l'identité à l'affiliation du produit
 * (`attribuerIdentiteKonnect`), et Konnect vient lire cette liste pour **créer les
 * cabinets lui-même**.
 *
 * ## Pourquoi une lecture et pas un appel
 *
 * Le Dashboard ne peut pas joindre Konnect : il est derrière le VPN (décision du
 * 08/09/2026). Tout ce qui descend est donc tiré, et le tenant ne peut naître que d'une
 * lecture. C'est le huitième chemin du pont, et le neuvième verbe.
 *
 * ## ⚠️ Ordre imposé
 *
 * Cette route doit être **servie avant** que Konnect ne la réclame. L'inverse fait
 * échouer la première synchronisation, et c'est exactement le piège du 08/09/2026.
 *
 * ## Clé d'API seule, jamais une session
 *
 * Même garde que `/api/konnect-tenant-mapping/resolve`, et pour la même raison : la
 * liste couvre TOUT le parc. `requireAuthOrApiKey` l'ouvrirait à n'importe quelle
 * session cliente, qui y lirait les cabinets de ses confrères.
 *
 * ## Ce qu'elle ne rend pas
 *
 * Les cabinets sans `slug`, c'est-à-dire ceux nés chez Konnect avant le 15/09/2026. Leur
 * identité vient d'ailleurs ; les redescendre ferait recréer un cabinet qui existe.
 */

type LigneAttendue = {
  tenantId: string;
  slug: string;
  name: string;
  userProductId: number;
  /** Deux chiffres, depuis le code postal d'un site du cabinet. `null` si inconnu. */
  departement: string | null;
};

export async function GET(req: NextRequest) {
  const erreurCle = requireApiKey(req, "KONNECT_API_KEY");
  if (erreurCle) return erreurCle;

  let lignes;
  try {
    lignes = await db.query<{
      tenantId: string;
      slug: string | null;
      name: string | null;
      email: string;
      userProductId: number;
      codePostal: string | null;
      maj: Date | null;
    }>(
      `SELECT m."tenantId"::text     AS "tenantId",
              m."slug"              AS "slug",
              u."name"              AS "name",
              u."email"             AS "email",
              m."userProductId"     AS "userProductId",
              (SELECT s."codePostal"
                 FROM "KonnectSites" s
                WHERE s."userProductId" = m."userProductId"
                  AND s."codePostal" ~ '^[0-9]{5}$'
                ORDER BY s."siteId"
                LIMIT 1)            AS "codePostal",
              m."updatedAt"         AS "maj"
         FROM "KonnectTenantMapping" m
         JOIN "UserProduct" up ON up."id" = m."userProductId"
         JOIN "Product" p      ON p."id"  = up."productId"
         JOIN "User" u         ON u."id"  = up."userId"
        WHERE up."removedAt" IS NULL
          AND lower(p."name") = lower($1)
          AND m."slug" IS NOT NULL
        ORDER BY m."userProductId"`,
      [PRODUITS.konnect.nom]
    );
  } catch (err: any) {
    // `42703` = colonne inconnue : la migration manuelle n'est pas passée. On rend une
    // liste vide plutôt qu'un 500 : Konnect traite l'indisponibilité comme une panne,
    // et une base non migrée n'attend simplement aucun cabinet.
    if (err?.code === "42703") {
      return NextResponse.json({ tenants: [] as LigneAttendue[] }, { headers: { "Cache-Control": "no-store" } });
    }
    throw err;
  }

  const tenants: LigneAttendue[] = lignes.rows.map((l) => ({
    tenantId: l.tenantId,
    slug: l.slug as string,
    // Konnect exige un nom non vide. L'identifiant de connexion en tient lieu quand le
    // centre n'a pas de nom : mieux vaut un cabinet nommé par son identifiant qu'un
    // cabinet refusé à la création.
    name: l.name?.trim() || l.email,
    userProductId: l.userProductId,
    departement: l.codePostal ? l.codePostal.slice(0, 2) : null,
  }));

  // Même forme d'ETag que `/api/konnect-examens` : Konnect sait déjà la poser en
  // `If-None-Match` et traiter un 304 comme « rien n'a bougé ».
  const derniere = lignes.rows.reduce<number>(
    (max, l) => Math.max(max, l.maj ? new Date(l.maj).getTime() : 0),
    0
  );
  const etag = `W/"${tenants.length}-${derniere}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    { tenants },
    { headers: { ETag: etag, "Cache-Control": "no-store" } }
  );
}

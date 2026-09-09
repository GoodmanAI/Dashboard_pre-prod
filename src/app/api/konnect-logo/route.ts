export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * Logo du cabinet affiché dans le portail patient LyraeKonnect.
 *
 *  GET    /api/konnect-logo?userProductId=NN   (session, ou clé API — Konnect tire)
 *  GET    /api/konnect-logo?tenantId=<uuid>    (clé API — voie d'amorçage)
 *  PUT    /api/konnect-logo?userProductId=NN   (session — le client téléverse)
 *  DELETE /api/konnect-logo?userProductId=NN   (session — le client retire son logo)
 *
 * POURQUOI UN BINAIRE EN BASE, ET PAS UNE URL. Le champ `logoUrl` demandait une
 * adresse chez un hébergeur qu'on ne maîtrise pas : le jour où le cabinet refait son
 * site, le logo disparaît du parcours patient sans que personne ne le voie. Il n'a
 * d'ailleurs jamais rien affiché (absent de `/cabinet-public` côté Konnect, aucun
 * `<img>` dans le parcours), et il ne le pouvait pas : la CSP de l'iframe est
 * `img-src 'self'`, qui bloque toute image tierce.
 *
 * POURQUOI UNE ROUTE À PART, ET PAS UN CHAMP DE `konnect-configuration`. Un binaire
 * n'a rien à faire dans un payload JSON de configuration : il gonflerait chaque
 * synchronisation de Konnect (toutes les quelques minutes) d'une image que rien n'a
 * changée. Ici Konnect envoie son `If-None-Match` et reçoit un 304 tant que le client
 * n'a pas redéposé.
 *
 * LE CHEMIN COMPLET, ET IL EST CONTRAINT DES DEUX CÔTÉS :
 *
 *   client téléverse ──▶ Dashboard (base de vérité)
 *                            │  Konnect TIRE (il est derrière un VPN : le Dashboard
 *                            ▼  ne l'appellera jamais, DECISIONS.md 08/09/2026)
 *                       Konnect (cache local)
 *                            │  même origine que le SPA → CSP inchangée
 *                            ▼
 *                       <img src="/p/{tenant}/logo">
 *
 * Cette route étant appelée sans session par Konnect, elle DOIT figurer dans
 * `PUBLIC_API_PATTERNS` de `src/middleware.ts`.
 *
 * Aucune donnée patient ici : un logo de cabinet est une image publique, elle figure
 * sur son site.
 */

/** Ce que le portail patient sait afficher, et rien d'autre. */
const TYPES_ACCEPTES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

/**
 * 512 Ko. Un logo de bandeau fait quelques dizaines de kilo-octets ; au-delà, c'est
 * une photo qu'on a déposée par erreur. La borne protège surtout le parcours patient :
 * l'image est chargée sur le PREMIER écran, souvent en 4G dans une salle d'attente.
 */
const TAILLE_MAX = 512 * 1024;

/** Résout le centre visé, quel que soit l'identifiant employé (cf. konnect-configuration). */
async function resoudreUserProductId(
  req: NextRequest
): Promise<{ userProductId: number } | { error: NextResponse }> {
  const { searchParams } = new URL(req.url);
  const tenantParam = searchParams.get("tenantId");

  if (tenantParam) {
    const res = await db
      .query<{ userProductId: number }>(
        `SELECT m."userProductId"
           FROM "KonnectTenantMapping" m
           JOIN "UserProduct" up ON up."id" = m."userProductId"
          WHERE m."tenantId" = $1::uuid
            AND up."removedAt" IS NULL
          LIMIT 1`,
        [tenantParam]
      )
      .catch(() => null);
    if (!res) {
      return { error: NextResponse.json({ error: "tenantId invalide" }, { status: 400 }) };
    }
    if (res.rowCount === 0) {
      return {
        error: NextResponse.json({ error: "Aucun centre rattaché à ce tenant" }, { status: 404 }),
      };
    }
    return { userProductId: res.rows[0].userProductId };
  }

  const brut = Number(searchParams.get("userProductId"));
  if (!brut || Number.isNaN(brut)) {
    return {
      error: NextResponse.json(
        { error: "Missing or invalid userProductId (ou tenantId)" },
        { status: 400 }
      ),
    };
  }
  return { userProductId: brut };
}

/** Le centre visé porte-t-il bien LyraeKonnect ? Comparaison par le référentiel. */
async function estCentreKonnect(userProductId: number): Promise<boolean> {
  const res = await db.query<{ id: number }>(
    `SELECT up."id"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."id" = $1
        AND up."removedAt" IS NULL
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, PRODUITS.konnect.nom]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Empreinte du logo, servie en `ETag`.
 *
 * Dérivée de la date de dépôt, pas du contenu : deux dépôts du même fichier doivent
 * quand même invalider le cache de Konnect (le client a pu redéposer parce qu'il
 * croyait le premier envoi perdu, et on lui doit un effet visible).
 */
function empreinte(maj: Date | null, octets: number): string {
  if (!maj) return '"vide"';
  return `"${maj.getTime()}-${octets}"`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  const cible = await resoudreUserProductId(req);
  if ("error" in cible) return cible.error;
  const { userProductId } = cible;

  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
    if (ownershipErr) return ownershipErr;
  }

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  const res = await db.query<{
    logoContenu: Buffer | null;
    logoType: string | null;
    logoMaj: Date | null;
  }>(
    `SELECT "logoContenu", "logoType", "logoMaj"
       FROM "KonnectSettings" WHERE "userProductId" = $1 LIMIT 1`,
    [userProductId]
  );

  const ligne = res.rows[0];
  if (!ligne?.logoContenu || !ligne.logoType) {
    // 404 et non 204 : « ce centre n'a pas de logo » est une réponse complète, et
    // Konnect en a besoin pour VIDER son cache si le client vient de retirer le sien.
    return NextResponse.json({ error: "Ce centre n'a pas de logo" }, { status: 404 });
  }

  const etag = empreinte(ligne.logoMaj, ligne.logoContenu.length);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(ligne.logoContenu), {
    status: 200,
    headers: {
      "Content-Type": ligne.logoType,
      "Content-Length": String(ligne.logoContenu.length),
      ETag: etag,
      // `no-cache` et non `no-store` : le cache est autorisé, mais revalidé. C'est
      // l'ETag qui décide, et lui seul sait si le client a redéposé.
      "Cache-Control": "no-cache",
    },
  });
}

export async function PUT(req: NextRequest) {
  // Session uniquement : déposer un logo est un geste de client, jamais de machine.
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (auth.bot) {
    return NextResponse.json({ error: "Écriture réservée à une session" }, { status: 403 });
  }

  const cible = await resoudreUserProductId(req);
  if ("error" in cible) return cible.error;
  const { userProductId } = cible;

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  const formData = await req.formData().catch(() => null);
  const fichier = formData?.get("fichier");
  if (!formData || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }

  if (!TYPES_ACCEPTES.has(fichier.type)) {
    return NextResponse.json(
      { error: "Format non accepté. Déposez un PNG, un JPEG, un WEBP ou un SVG." },
      { status: 400 }
    );
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json(
      { error: "Fichier trop lourd. La limite est de 512 Ko." },
      { status: 400 }
    );
  }
  if (fichier.size === 0) {
    return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  // Nom tronqué : il est purement informatif (il s'affiche dans l'écran pour que le
  // client reconnaisse ce qu'il a déposé), aucun code ne s'en sert.
  const nom = fichier.name.slice(0, 200);

  await db.query(
    `INSERT INTO "KonnectSettings" ("userProductId", "logoContenu", "logoType", "logoNom", "logoMaj")
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ("userProductId")
       DO UPDATE SET "logoContenu" = EXCLUDED."logoContenu",
                     "logoType"    = EXCLUDED."logoType",
                     "logoNom"     = EXCLUDED."logoNom",
                     "logoMaj"     = EXCLUDED."logoMaj",
                     "updatedAt"   = NOW()`,
    [userProductId, contenu, fichier.type, nom]
  );

  // Volume et type seulement : le contenu est une image, la journaliser n'apprendrait
  // rien et gonflerait les logs consommés par Grafana.
  auditLog("data", "konnect-logo-depot", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { type: fichier.type, octets: fichier.size },
  });

  return NextResponse.json({ ok: true, type: fichier.type, nom, octets: fichier.size });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (auth.bot) {
    return NextResponse.json({ error: "Écriture réservée à une session" }, { status: 403 });
  }

  const cible = await resoudreUserProductId(req);
  if ("error" in cible) return cible.error;
  const { userProductId } = cible;

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  // `logoMaj` est mis à jour, pas effacé : c'est lui qui porte l'ETag, et Konnect doit
  // voir que quelque chose a changé pour vider son propre cache. L'effacer ferait
  // survivre l'ancien logo côté portail jusqu'au prochain dépôt.
  await db.query(
    `UPDATE "KonnectSettings"
        SET "logoContenu" = NULL, "logoType" = NULL, "logoNom" = NULL,
            "logoMaj" = NOW(), "updatedAt" = NOW()
      WHERE "userProductId" = $1`,
    [userProductId]
  );

  auditLog("data", "konnect-logo-retrait", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
  });

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import {
  trouverDomaine,
  produitDuDomaine,
  etagDe,
  estObjetJson,
  type Domaine,
} from "@/lib/productConfig";

/**
 * Configuration générique d'un centre, par domaine (lot B).
 *
 * Complète les tables typées (`TalkSettings`, `KonnectSettings`) plutôt qu'elle
 * ne les remplace : ce qui s'édite au clic mérite un schéma et un écran ; ce que
 * le client règle une fois à l'installation vit très bien en JSON versionné. Le
 * critère est la fréquence d'édition, pas la taille du corpus.
 *
 *  GET /api/product-config?userProductId=NN&domaine=X   (session, ou clé API)
 *      → 200 { domaine, version, valeur, updatedAt } + ETag
 *      → 304 si `If-None-Match` correspond à la version courante
 *  PUT /api/product-config?userProductId=NN&domaine=X   (session uniquement)
 *      body : { valeur: object }
 *
 * **La lecture conditionnelle n'est pas un raffinement.** Un catalogue d'examens
 * ou un corpus de règles pèse des centaines de lignes ; le transporter à chaque
 * requête patient serait intenable. Le consommateur envoie `If-None-Match` et
 * reçoit un 304 tant que rien n'a bougé. Le patron est celui de
 * `UserProduct.moduleInfoVersion`, déjà en service pour les Module Info Items.
 *
 * **Le Dashboard n'interprète jamais `valeur`.** Sa forme n'est connue que du
 * produit consommateur. La seule contrainte imposée est d'être un objet à la
 * racine (cf. `estObjetJson`), pour rester extensible.
 *
 * Sécurité : trois vérifications que la table ne peut pas porter, toutes dans
 * `src/lib/productConfig.ts` — le domaine est-il déclaré, à quel produit
 * appartient-il, et quelle clé d'API a le droit de le lire. Sans la troisième,
 * la clé de Konnect ouvrirait la configuration de LyraeTalk.
 *
 * Route à déclarer dans `PUBLIC_API_PATTERNS` (`src/middleware.ts`) : l'appel
 * d'une brique n'a pas de session.
 */

type LigneConfig = {
  valeur: Record<string, unknown>;
  version: number;
  updatedAt: Date;
};

/** Résout la cible et vérifie que le domaine, le produit et la clé concordent. */
async function resoudreCible(
  req: NextRequest
): Promise<{ userProductId: number; domaine: Domaine } | { error: NextResponse }> {
  const { searchParams } = new URL(req.url);

  const domaine = trouverDomaine(searchParams.get("domaine"));
  if (!domaine) {
    // Volontairement explicite : un slug inconnu est une faute d'intégration, pas
    // une tentative d'accès. Le taire ferait perdre des heures côté appelant.
    return {
      error: NextResponse.json({ error: "Domaine de configuration inconnu" }, { status: 400 }),
    };
  }

  const userProductId = Number(searchParams.get("userProductId"));
  if (!userProductId || Number.isNaN(userProductId)) {
    return {
      error: NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 }),
    };
  }

  return { userProductId, domaine };
}

/** Le centre porte-t-il le produit auquel ce domaine appartient ? */
async function centrePorteLeProduit(userProductId: number, domaine: Domaine): Promise<boolean> {
  const res = await db.query<{ id: number }>(
    `SELECT up."id"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."id" = $1
        AND up."removedAt" IS NULL
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, produitDuDomaine(domaine)]
  );
  return (res.rowCount ?? 0) > 0;
}

async function lireLigne(userProductId: number, domaine: string): Promise<LigneConfig | null> {
  const res = await db.query<LigneConfig>(
    `SELECT "valeur", "version", "updatedAt"
       FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = $2
      LIMIT 1`,
    [userProductId, domaine]
  );
  return res.rowCount ? res.rows[0] : null;
}

export async function GET(req: NextRequest) {
  const cibleOuErreur = await resoudreCible(req);
  if ("error" in cibleOuErreur) return cibleOuErreur.error;
  const { userProductId, domaine } = cibleOuErreur;

  // La clé attendue dépend du domaine : celle de Konnect n'ouvre pas les
  // domaines de LyraeTalk, et inversement.
  const auth = await requireAuthOrApiKey(req, domaine.cleApiEnv);
  if (auth.error) return auth.error;

  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
    if (ownershipErr) return ownershipErr;
  }

  if (!(await centrePorteLeProduit(userProductId, domaine))) {
    return NextResponse.json(
      { error: "Ce centre ne porte pas le produit de ce domaine" },
      { status: 404 }
    );
  }

  const ligne = await lireLigne(userProductId, domaine.cle);

  // Aucune ligne : le domaine n'a jamais été configuré. On répond 200 avec un
  // objet vide en version 0, et non 404 — « pas encore configuré » est un état
  // normal, que le consommateur doit pouvoir distinguer d'une erreur. Sa
  // politique de défauts lui appartient.
  const version = ligne?.version ?? 0;
  const etag = etagDe(version);

  if (req.headers.get("if-none-match") === etag) {
    // 304 : ni corps, ni Content-Type. C'est tout l'intérêt du mécanisme.
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    {
      domaine: domaine.cle,
      version,
      valeur: ligne?.valeur ?? {},
      updatedAt: ligne?.updatedAt ?? null,
    },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

export async function PUT(req: NextRequest) {
  const cibleOuErreur = await resoudreCible(req);
  if ("error" in cibleOuErreur) return cibleOuErreur.error;
  const { userProductId, domaine } = cibleOuErreur;

  const auth = await requireAuthOrApiKey(req, domaine.cleApiEnv);
  if (auth.error) return auth.error;

  // Écriture réservée à une session, comme pour `konnect-configuration` : la
  // configuration se pilote depuis le Dashboard, les briques ne font que lire.
  if (auth.bot) {
    return NextResponse.json(
      { error: "Lecture seule pour un appel par clé API." },
      { status: 403 }
    );
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  if (!(await centrePorteLeProduit(userProductId, domaine))) {
    return NextResponse.json(
      { error: "Ce centre ne porte pas le produit de ce domaine" },
      { status: 404 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const valeur = body?.valeur;
  if (!estObjetJson(valeur)) {
    return NextResponse.json(
      { error: "`valeur` doit être un objet JSON (ni tableau, ni scalaire)." },
      { status: 400 }
    );
  }

  // `version + 1` calculé par la base : deux écritures concurrentes ne peuvent
  // pas produire deux fois le même numéro, donc l'ETag reste fiable.
  const res = await db.query<{ version: number }>(
    `INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
     VALUES ($1, $2, $3::jsonb, 1)
     ON CONFLICT ("userProductId", "domaine")
       DO UPDATE SET "valeur"    = EXCLUDED."valeur",
                     "version"   = "ProductConfig"."version" + 1,
                     "updatedAt" = NOW()
     RETURNING "version"`,
    [userProductId, domaine.cle, JSON.stringify(valeur)]
  );

  const version = res.rows[0].version;

  auditLog("data", "product-config-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    // Le contenu n'est pas journalisé : ce sont des réglages de centre, et le
    // log d'audit part vers Grafana sans avoir besoin de les porter.
    metadata: { domaine: domaine.cle, version },
  });

  return NextResponse.json(
    { domaine: domaine.cle, version, valeur },
    { headers: { ETag: etagDe(version) } }
  );
}

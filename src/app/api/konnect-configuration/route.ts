export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import {
  KONNECT_DEFAUTS,
  normaliserConfigKonnect,
  versPayloadKonnect,
  COLONNES_KONNECT,
  type ConfigKonnect,
} from "@/lib/konnectConfig";

/**
 * Configuration LyraeKonnect d'un centre.
 *
 * Même rôle que `GET /api/configuration` pour LyraeTalk : le client paramètre
 * depuis le Dashboard, qui est propriétaire de la valeur, et la brique
 * consommatrice vient la lire.
 *
 *  GET /api/konnect-configuration?userProductId=NN     (session, ou clé API)
 *  GET /api/konnect-configuration?tenantId=<uuid>      (clé API — voie historique)
 *  PUT /api/konnect-configuration?userProductId=NN     (session uniquement)
 *
 * **Depuis le lot A (26/08/2026), Konnect appelle par `userProductId`**, comme
 * LyraeTalk : il le résout une fois via
 * `GET /api/konnect-tenant-mapping/resolve?tenantId=…` et le retient. Une seule
 * forme d'appel pour les deux produits, donc plus de traduction à refaire dans
 * chaque future route de configuration.
 *
 * La forme `?tenantId=` **reste supportée** et n'est pas dépréciée : c'est la
 * voie d'amorçage (Konnect qui n'a pas encore résolu son identifiant) et le
 * filet quand un cabinet est re-rattaché à un autre centre. La traduction passe
 * toujours par `KonnectTenantMapping`.
 *
 * Authentification machine-à-machine par `x-api-key: KONNECT_API_KEY`,
 * **distincte de `BOT_API_KEY`** : réutiliser celle de LyraeTalk rendrait les
 * deux briques indistinguables dans les logs d'audit, dont le format est
 * consommé par Grafana.
 *
 * Cette route étant appelée sans session, elle DOIT figurer dans
 * `PUBLIC_API_PATTERNS` de `src/middleware.ts` — sans quoi le middleware
 * renvoie 401 avant même d'atteindre ce handler.
 *
 * Le corps de réponse est en **snake_case**, aligné sur `ParametresOut` de
 * Konnect (`backend/app/cabinet/api.py`) : Konnect le consomme sans traduction.
 * Le stockage, lui, suit la convention camelCase du Dashboard.
 *
 * Aucune ligne n'est créée à la lecture : un centre jamais configuré renvoie
 * les défauts *fail-closed*, identiques à ceux de `cabinet_parametres`.
 */

/** Résout le centre visé, quel que soit l'identifiant employé par l'appelant. */
async function resoudreUserProductId(
  req: NextRequest
): Promise<{ userProductId: number } | { error: NextResponse }> {
  const { searchParams } = new URL(req.url);
  const tenantParam = searchParams.get("tenantId");

  if (tenantParam) {
    const res = await db.query<{ userProductId: number }>(
      `SELECT m."userProductId"
         FROM "KonnectTenantMapping" m
         JOIN "UserProduct" up ON up."id" = m."userProductId"
        WHERE m."tenantId" = $1::uuid
          AND up."removedAt" IS NULL
        LIMIT 1`,
      [tenantParam]
    ).catch(() => null);

    // `catch` : un tenantId mal formé fait échouer le cast ::uuid côté Postgres
    // (22P02). On répond 400 plutôt que de laisser fuir une erreur SQL.
    if (!res) {
      return { error: NextResponse.json({ error: "tenantId invalide" }, { status: 400 }) };
    }
    if (res.rowCount === 0) {
      return {
        error: NextResponse.json(
          { error: "Aucun centre rattaché à ce tenant" },
          { status: 404 }
        ),
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

/**
 * Le centre visé porte-t-il bien le produit LyraeKonnect ?
 *
 * Tant que Konnect s'identifiait par `tenantId`, la traduction garantissait la
 * réponse : `KonnectTenantMapping` ne rattache que des centres Konnect. Depuis
 * le lot A il appelle par `userProductId`, et ce garde-fou disparaîtrait sans
 * cette vérification — un appel par clé pourrait désigner un centre LyraeTalk et
 * recevoir une configuration Konnect qui n'a aucun sens pour lui.
 *
 * Comparaison par le référentiel (`PRODUITS`), jamais par une chaîne en dur.
 */
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

async function lireConfig(userProductId: number): Promise<ConfigKonnect> {
  const colonnes = COLONNES_KONNECT.map((c) => `"${c}"`).join(", ");
  const res = await db.query<Record<string, unknown>>(
    `SELECT ${colonnes} FROM "KonnectSettings" WHERE "userProductId" = $1 LIMIT 1`,
    [userProductId]
  );
  if (res.rowCount === 0) return { ...KONNECT_DEFAUTS };
  return normaliserConfigKonnect(res.rows[0]);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  const cible = await resoudreUserProductId(req);
  if ("error" in cible) return cible.error;

  // Un appel machine-à-machine a déjà prouvé son identité par la clé ; une
  // session doit en plus prouver que le centre lui appartient.
  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(auth.session, cible.userProductId);
    if (ownershipErr) return ownershipErr;
  } else if (!(await estCentreKonnect(cible.userProductId))) {
    // Même réponse qu'un tenant non rattaché : de l'extérieur, « ce centre n'est
    // pas un centre Konnect » et « ce cabinet n'est rattaché à rien » sont le
    // même cas — il n'y a pas de configuration Konnect à servir.
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  const config = await lireConfig(cible.userProductId);
  return NextResponse.json({
    userProductId: cible.userProductId,
    ...versPayloadKonnect(config),
  });
}

export async function PUT(req: NextRequest) {
  // L'écriture reste réservée à une session : la configuration se pilote depuis
  // le Dashboard, Konnect ne fait que la lire.
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (auth.bot) {
    return NextResponse.json(
      { error: "Lecture seule pour un appel par clé API." },
      { status: 403 }
    );
  }

  const cible = await resoudreUserProductId(req);
  if ("error" in cible) return cible.error;

  const ownershipErr = await assertUserProductOwnership(auth.session, cible.userProductId);
  if (ownershipErr) return ownershipErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actuelle = await lireConfig(cible.userProductId);
  let config: ConfigKonnect;
  try {
    // Fusion sur l'existant : le client peut n'envoyer qu'une section sans
    // remettre le reste aux défauts.
    config = normaliserConfigKonnect({ ...actuelle, ...body }, { strict: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Valeur invalide" }, { status: 400 });
  }

  // Règle métier reprise de Konnect : le questionnaire clinique peut bloquer un
  // RDV, et l'écran de blocage invite à appeler le secrétariat. Sans numéro, le
  // patient est dans une impasse.
  if (config.cliniqueActif && !config.telephoneSecretariat?.trim()) {
    return NextResponse.json(
      {
        error:
          "Le questionnaire clinique exige un numéro de secrétariat : c'est le numéro affiché au patient dont le RDV est bloqué.",
      },
      { status: 400 }
    );
  }

  // `COLONNES_KONNECT` ne contient que les champs de configuration :
  // `userProductId` est passé à part, en $1.
  const colonnes = COLONNES_KONNECT;
  const valeurs = colonnes.map((c) => (config as any)[c]);
  const placeholders = colonnes.map((_, i) => `$${i + 2}`).join(", ");
  const majSet = colonnes.map((c, i) => `"${c}" = $${i + 2}`).join(", ");

  await db.query(
    `INSERT INTO "KonnectSettings" ("userProductId", ${colonnes.map((c) => `"${c}"`).join(", ")})
     VALUES ($1, ${placeholders})
     ON CONFLICT ("userProductId")
       DO UPDATE SET ${majSet}, "updatedAt" = NOW()`,
    [cible.userProductId, ...valeurs]
  );

  auditLog("data", "konnect-configuration-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: cible.userProductId },
    // Les valeurs elles-mêmes ne sont pas journalisées : ce sont des réglages de
    // centre, pas des données patient, mais le log d'audit part vers Grafana et
    // n'a pas besoin de les porter.
    metadata: { champs: Object.keys(body ?? {}).length },
  });

  const relue = await lireConfig(cible.userProductId);
  return NextResponse.json({
    userProductId: cible.userProductId,
    ...versPayloadKonnect(relue),
  });
}

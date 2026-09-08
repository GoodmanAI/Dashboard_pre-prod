export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { PRODUITS } from "@/lib/produits";

/**
 * Ce que Konnect remonte au Dashboard (lot E du plan
 * `plans/2026-09-konnect-angles-morts-console.md`).
 *
 * Le Dashboard sait tout de la configuration d'un centre Konnect, et rien de son
 * état : si les SMS partent vraiment, où les patients abandonnent. Ces faits vivent
 * chez Konnect, et **le Dashboard ne pourra jamais aller les chercher** : Konnect
 * passe derrière un VPN. Le seul sens possible est un push, comme pour les demandes
 * de rappel (`DECISIONS.md`, 08/09/2026).
 *
 *  POST /api/konnect-remontee?userProductId=NN   (KONNECT_API_KEY)
 *  GET  /api/konnect-remontee?userProductId=NN   (session)
 *
 * MÊME RENVERSEMENT QUE `konnect-demandes-rappel`, et pour la même raison : la
 * donnée naît chez Konnect. Le `POST` est donc réservé à la clé, et le `GET` à une
 * session — Konnect ne relit jamais ce qu'il a déposé. C'est la deuxième route
 * `konnect-*` où la clé écrit, et il ne devrait pas y en avoir d'autre : partout
 * ailleurs le Dashboard est propriétaire et Konnect consomme.
 *
 * CE QUI NE PEUT PAS ENTRER ICI :
 *
 * - **De la configuration.** Elle appartient au Dashboard. Une remontée qui
 *   l'écraserait rouvrirait la double vérité fermée le 28/08/2026. La route ne
 *   stocke que sous `charge`, jamais dans `KonnectSettings` ni ailleurs.
 * - **De la donnée patient.** Ce sont des agrégats. La seule donnée patient de
 *   cette base reste `KonnectDemandeRappel`, décidée le 02/09/2026. Les sections
 *   acceptées sont donc énumérées ci-dessous, et le reste est écarté : une clé
 *   inconnue n'est pas stockée, ce qui évite qu'un futur émetteur trop bavard
 *   dépose ici quelque chose que personne n'a examiné.
 *
 * LA FRAÎCHEUR EST HORODATÉE PAR LE DASHBOARD, à la réception. Une horloge décalée
 * sur la VM Konnect ferait passer une remontée périmée pour fraîche, et c'est
 * exactement ce que l'écran regarde pour décider s'il peut s'y fier.
 */

/**
 * Sections acceptées. Une remontée qui n'en contient aucune est refusée : c'est
 * une erreur d'appel, pas un état vide.
 *
 * `messagerie` : les canaux d'envoi sont-ils réellement en service chez ce centre.
 * C'est le point 08 de la revue du 02/09 — le cabinet voyait « SMS : activé » alors
 * que rien ne partait.
 */
const SECTIONS = new Set(["messagerie"]);

/** Garde de taille : au-delà, c'est une erreur d'appel, pas un état. */
const MAX_OCTETS_CHARGE = 64 * 1024;

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

function lireUserProductId(req: NextRequest): number | null {
  const brut = Number(new URL(req.url).searchParams.get("userProductId"));
  return !brut || Number.isNaN(brut) ? null : brut;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  // Une remontée est une observation faite par le portail. Une session qui la
  // posterait écrirait un état que personne n'a constaté.
  if (!auth.bot) {
    return NextResponse.json(
      { error: "Une remontée d'état vient du portail patient." },
      { status: 403 }
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  // 404 et non 400 : « ce centre n'est pas un centre Konnect » est le cas d'un
  // rattachement défait côté Dashboard. Konnect le traite comme « non rattaché »,
  // pas comme une panne, et cesse d'insister.
  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Le corps doit être un objet." }, { status: 400 });
  }

  // Filtrage par liste blanche : ce qui n'est pas énuméré n'est pas stocké. Une
  // section inconnue n'est pas une erreur (un Konnect plus récent peut en envoyer
  // une que ce Dashboard ignore), elle est simplement laissée de côté.
  const charge: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(body)) {
    if (SECTIONS.has(cle) && valeur && typeof valeur === "object") charge[cle] = valeur;
  }
  if (Object.keys(charge).length === 0) {
    return NextResponse.json(
      { error: `Aucune section connue. Attendu : ${[...SECTIONS].join(", ")}.` },
      { status: 400 }
    );
  }

  const serialisee = JSON.stringify(charge);
  if (Buffer.byteLength(serialisee, "utf8") > MAX_OCTETS_CHARGE) {
    return NextResponse.json({ error: "Remontée trop volumineuse." }, { status: 413 });
  }

  // Fusion sur l'existant, section par section : Konnect peut n'avoir à remonter
  // que la messagerie sans effacer ce qu'il avait dit du reste. Même principe que
  // le `PUT` de la configuration, dans l'autre sens.
  await db.query(
    `INSERT INTO "KonnectRemontee" ("userProductId", "charge", "recuAt")
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT ("userProductId")
       DO UPDATE SET "charge" = "KonnectRemontee"."charge" || EXCLUDED."charge",
                     "recuAt" = NOW(),
                     "updatedAt" = NOW()`,
    [userProductId, serialisee]
  );

  // Pas d'`auditLog` : ce n'est ni un geste humain ni une donnée sensible, et une
  // remontée périodique noierait le journal d'audit qui part vers Grafana.
  return NextResponse.json({ userProductId, sections: Object.keys(charge) }, { status: 200 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  // Konnect n'a aucune raison de relire ce qu'il a lui-même observé : il le sait
  // mieux que nous. Lui ouvrir la lecture serait une porte sans usage.
  if (auth.bot) {
    return NextResponse.json(
      { error: "Lecture réservée au Dashboard." },
      { status: 403 }
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  const res = await db.query<{ charge: unknown; recuAt: Date }>(
    `SELECT "charge", "recuAt" FROM "KonnectRemontee" WHERE "userProductId" = $1`,
    [userProductId]
  );

  // Jamais 404 : « le portail n'a encore rien remonté » est un état normal, que
  // l'écran doit pouvoir afficher tel quel. Une erreur le ferait passer pour une
  // panne.
  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ userProductId, charge: {}, recuAt: null });
  }

  return NextResponse.json({
    userProductId,
    charge: res.rows[0].charge ?? {},
    recuAt: res.rows[0].recuAt,
  });
}

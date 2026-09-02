export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";

/**
 * Demandes de rappel des patients LyraeKonnect
 * (chantier `plans/2026-09-konnect-deux-chemins.md`, lot 2).
 *
 * Quand l'examen demandé n'est pas coché « Réservable en ligne » dans le mapping,
 * le portail ne propose aucun créneau. Il offre au patient de laisser son numéro.
 * S'il accepte, Konnect dépose sa demande ici et le secrétariat la rappelle. S'il
 * refuse, on lui affiche le numéro du centre et **rien n'est enregistré**.
 *
 *  POST  /api/konnect-demandes-rappel?userProductId=NN   (KONNECT_API_KEY)
 *  GET   /api/konnect-demandes-rappel?userProductId=NN   (session)
 *  PATCH /api/konnect-demandes-rappel?userProductId=NN   (session)
 *
 * DEUX SINGULARITÉS, toutes deux assumées et à ne pas généraliser.
 *
 * 1. **C'est la seule route `konnect-*` où la clé d'API écrit.** Partout ailleurs
 *    un appel par clé est en lecture seule et le `PUT` répond 403 : le Dashboard est
 *    la base de vérité de la configuration, Konnect la consomme. Ici le sens
 *    s'inverse, parce que la donnée naît chez le patient. Le `POST` est donc
 *    réservé à la clé, et le `GET`/`PATCH` à une session : Konnect ne relit jamais
 *    ce qu'il a déposé.
 *
 * 2. **C'est la seule table de cette base qui porte de la donnée patient.** Nom,
 *    prénom, téléphone. Q33 (dépôt public) et Q34 (PostgreSQL exposé) restent
 *    ouverts et ne portaient jusqu'ici que sur de la configuration. Trois règles
 *    tenues ici, et qui ne se négocient pas :
 *      · le strict minimum descend, jamais l'ordonnance ni le questionnaire ;
 *      · l'`auditLog` ne compte que des volumes, jamais un nom ni un numéro ;
 *      · la purge à 90 jours après traitement est obligatoire
 *        (`scripts/db-maintenance/purge_konnect_demandes_rappel.sh`).
 *
 * L'idempotence passe par `referenceKonnect`, l'identifiant de la demande de RDV
 * côté portail : un patient qui valide deux fois, ou un renvoi après coupure
 * réseau, ne crée pas deux appels à passer pour la secrétaire.
 */

const STATUTS = new Set(["a_rappeler", "rappele", "sans_suite"]);

/** Longueurs de garde : au-delà, c'est une erreur d'appel, pas une saisie. */
const MAX_NOM = 120;
const MAX_TELEPHONE = 30;
const MAX_EXAMEN = 200;
const MAX_NOTE = 2000;
const MAX_REFERENCE = 100;

type DemandeRow = {
  id: number;
  referenceKonnect: string;
  nom: string;
  prenom: string;
  telephone: string;
  examenLibelle: string;
  statut: string;
  note: string;
  traiteePar: string | null;
  traiteeAt: Date | null;
  createdAt: Date;
};

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

/**
 * Nettoie un numéro sans le réécrire : on retire ce qui sépare (espaces, points,
 * tirets, parenthèses) et on garde le reste tel quel. Pas de mise au format
 * international : un numéro déformé serait pire qu'un numéro moche, la secrétaire
 * doit pouvoir le composer.
 */
function normaliserTelephone(brut: unknown): string {
  if (typeof brut !== "string") return "";
  return brut.replace(/[\s.\-()]/g, "").slice(0, MAX_TELEPHONE);
}

function texte(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Le numéro doit rester composable : au moins 6 chiffres, un `+` toléré en tête. */
function telephonePlausible(tel: string): boolean {
  return /^\+?\d{6,}$/.test(tel);
}

// ---------------------------------------------------------------- POST (Konnect)

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  // Le dépôt est un geste de Konnect, pas d'un utilisateur du Dashboard. Une
  // session qui poste écrirait une demande de rappel au nom d'un patient qui n'a
  // rien demandé : on refuse plutôt que d'ouvrir cette porte.
  if (!auth.bot) {
    return NextResponse.json(
      { error: "Le dépôt d'une demande de rappel vient du portail patient." },
      { status: 403 }
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

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

  const reference = texte(body?.referenceKonnect, MAX_REFERENCE);
  if (!reference) {
    return NextResponse.json({ error: "`referenceKonnect` est requis." }, { status: 400 });
  }

  const telephone = normaliserTelephone(body?.telephone);
  if (!telephonePlausible(telephone)) {
    return NextResponse.json(
      { error: "Le numéro de téléphone est absent ou inexploitable." },
      { status: 400 }
    );
  }

  const nom = texte(body?.nom, MAX_NOM);
  const prenom = texte(body?.prenom, MAX_NOM);
  const examenLibelle = texte(body?.examenLibelle, MAX_EXAMEN);

  // Idempotent sur (centre, référence). Un renvoi rafraîchit le numéro sans
  // ressusciter une demande que le secrétariat a déjà traitée.
  const res = await db.query<{ id: number; statut: string }>(
    `INSERT INTO "KonnectDemandesRappel"
       ("userProductId", "referenceKonnect", "nom", "prenom", "telephone", "examenLibelle")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("userProductId", "referenceKonnect") DO UPDATE
       SET "telephone"     = EXCLUDED."telephone",
           "nom"           = EXCLUDED."nom",
           "prenom"        = EXCLUDED."prenom",
           "examenLibelle" = EXCLUDED."examenLibelle",
           "updatedAt"     = NOW()
     RETURNING "id", "statut"`,
    [userProductId, reference, nom, prenom, telephone, examenLibelle]
  );

  // Volumes seulement. Ni nom, ni numéro, ni référence de dossier.
  auditLog("data", "konnect-demande-rappel-depot", {
    actor: { id: null, email: null, role: "konnect", ip: extractIpFromRequest(req), userAgent: extractUserAgent(req) },
    target: { type: "userProduct", id: userProductId },
    metadata: { statut: res.rows[0].statut },
  });

  return NextResponse.json({ id: res.rows[0].id, statut: res.rows[0].statut }, { status: 201 });
}

// ------------------------------------------------------------------ GET (écran)

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  // Les demandes à rappeler d'abord, les plus anciennes en tête : c'est le patient
  // qui attend depuis le plus longtemps qu'on rappelle en premier.
  const res = await db.query<DemandeRow>(
    `SELECT "id", "referenceKonnect", "nom", "prenom", "telephone", "examenLibelle",
            "statut", "note", "traiteePar", "traiteeAt", "createdAt"
       FROM "KonnectDemandesRappel"
      WHERE "userProductId" = $1
      ORDER BY ("statut" = 'a_rappeler') DESC, "createdAt" ASC
      LIMIT 500`,
    [userProductId]
  );

  const aRappeler = res.rows.filter((d) => d.statut === "a_rappeler").length;

  return NextResponse.json(
    { userProductId, count: res.rowCount ?? 0, aRappeler, demandes: res.rows },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// ---------------------------------------------------------------- PATCH (écran)

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body?.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "`id` est requis." }, { status: 400 });
  }

  const statut = texte(body?.statut, 20);
  if (!STATUTS.has(statut)) {
    return NextResponse.json(
      { error: `Le statut « ${statut} » n'existe pas.` },
      { status: 400 }
    );
  }
  const note = texte(body?.note, MAX_NOTE);

  // `traiteeAt` déclenche la purge : on ne la pose que sur une demande réellement
  // sortie de la file, et on l'efface si le secrétariat la remet à rappeler.
  const traitee = statut !== "a_rappeler";

  const res = await db.query<{ id: number }>(
    `UPDATE "KonnectDemandesRappel"
        SET "statut"     = $3,
            "note"       = $4,
            "traiteePar" = CASE WHEN $5::boolean THEN $6 ELSE NULL END,
            "traiteeAt"  = CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
            "updatedAt"  = NOW()
      WHERE "id" = $1 AND "userProductId" = $2
      RETURNING "id"`,
    [id, userProductId, statut, note, traitee, auth.session.user.email ?? null]
  );

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "Demande de rappel inconnue." }, { status: 404 });
  }

  auditLog("data", "konnect-demande-rappel-maj", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { statut },
  });

  return NextResponse.json({ id, statut });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey } from "@/lib/auth-helpers";
import {
  auditLog,
  extractIpFromRequest,
  extractUserAgent,
} from "@/lib/auditLog";
import { EVENEMENTS } from "@/lib/konnectFileAttente";
import {
  COLONNES_INSCRIPTION,
  estCentreKonnect,
  lireUserProductId,
  rdvAttenteANettoyer,
  type InscriptionRow,
} from "@/lib/konnectFileAttenteServeur";

/**
 * File d'attente des patients LyraeKonnect (27/10/2026).
 * Plan workspace `plans/2026-10-file-attente-konnect.md`, `DECISIONS.md` du 27/10.
 *
 *  POST /api/konnect-file-attente?userProductId=NN   (KONNECT_API_KEY) inscription
 *  GET  /api/konnect-file-attente?userProductId=NN   (KONNECT_API_KEY) la file vivante
 *  POST /api/konnect-file-attente/transition?userProductId=NN   (KONNECT_API_KEY) un geste
 *
 * QUATRIÈME FLUX MONTANT DE KONNECT, et le seul où Konnect relit ce qu'il a écrit.
 * La file ne vit qu'ici : Konnect n'en garde aucune copie, il la relit à chaque
 * passage de son moteur et ne fait rien s'il ne joint pas le Dashboard. C'est ce qui
 * garantit qu'un patient traité par la secrétaire ne reçoit plus rien de la file.
 *
 * DONNÉE PATIENT, comme `konnect-demandes-rappel` : nom, prénom, date de naissance,
 * téléphone. L'`auditLog` ne compte que des volumes ; purge 30 jours après la sortie
 * (`scripts/db-maintenance/purge_konnect_file_attente.sh`).
 *
 * Accès et gestes : `src/lib/konnectFileAttenteServeur.ts`. L'écran « Liste d'attente »
 * (session) lit et agit par `/api/konnect-file-attente/ecran` (lot L2).
 */

const MAX_NOM = 120;
const MAX_TELEPHONE = 30;
const MAX_EXAMEN = 300;
const MAX_REFERENCE = 100;
const MAX_SITES = 30;

function texte(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Même nettoyage que les demandes de rappel : on retire les séparateurs, rien d'autre. */
function normaliserTelephone(brut: unknown): string {
  if (typeof brut !== "string") return "";
  return brut.replace(/[\s.\-()]/g, "").slice(0, MAX_TELEPHONE);
}

/** Une date réelle, dans le passé, et pas plus de 130 ans. */
function dateNaissanceValable(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    return false;
  const an = d.getUTCFullYear();
  return d.getTime() <= Date.now() && an >= new Date().getUTCFullYear() - 130;
}

// ---------------------------------------------------------------- POST (Konnect)

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  // L'inscription vient du patient, par le portail. Une session qui posterait
  // inscrirait quelqu'un qui n'a rien demandé.
  if (!auth.bot) {
    return NextResponse.json(
      { error: "L'inscription en file d'attente vient du portail patient." },
      { status: 403 },
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = texte(body?.referenceKonnect, MAX_REFERENCE);
  const codeExamen = texte(body?.codeExamen, 50);
  const nom = texte(body?.nom, MAX_NOM);
  const prenom = texte(body?.prenom, MAX_NOM);
  const dateNaissance = texte(body?.dateNaissance, 10);
  const telephone = normaliserTelephone(body?.telephone);

  const manquants: string[] = [];
  if (!reference) manquants.push("referenceKonnect");
  if (!codeExamen) manquants.push("codeExamen");
  if (!nom) manquants.push("nom");
  if (!prenom) manquants.push("prenom");
  if (manquants.length) {
    return NextResponse.json(
      { error: `Champs requis : ${manquants.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!dateNaissanceValable(dateNaissance)) {
    return NextResponse.json(
      { error: "La date de naissance est absente ou impossible." },
      { status: 400 },
    );
  }
  // Un portable : c'est par SMS que le patient sera prévenu.
  if (!/^(\+33|0)[67]\d{8}$/.test(telephone)) {
    return NextResponse.json(
      { error: "Le numéro de portable est absent ou inexploitable." },
      { status: 400 },
    );
  }

  const sitesBruts: unknown[] = Array.isArray(body?.sites) ? body.sites : [];
  const sites = Array.from(
    new Set(sitesBruts.map((s) => texte(s, 20).toUpperCase()).filter(Boolean)),
  ).slice(0, MAX_SITES);

  // La case doit être cochée, et l'examen réservable : Konnect le sait par le
  // catalogue, mais un catalogue en cache peut avoir une heure de retard.
  const examen = await db.query<{ libelle: string }>(
    `SELECT COALESCE(NULLIF(trim("libelleClient"), ''), "libelle", "codeExamenClient") AS "libelle"
       FROM "KonnectExamens"
      WHERE "userProductId" = $1 AND trim("codeExamenClient") = $2
        AND "performed" AND "reservableEnLigne" AND "fileAttente"
      LIMIT 1`,
    [userProductId, codeExamen],
  );
  if ((examen.rowCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "La file d'attente n'est pas ouverte pour cet examen." },
      { status: 409 },
    );
  }
  const examenLibelle =
    texte(body?.examenLibelle, MAX_EXAMEN) || examen.rows[0].libelle;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Même patient, même examen, encore dans la file : on rafraîchit le numéro et
    // les sites, sans le faire reculer ni le remettre en tête (K2).
    const existant = await client.query<{ id: number; etat: string }>(
      `UPDATE "KonnectFileAttente"
          SET "telephone" = $6, "sites" = $7, "updatedAt" = NOW()
        WHERE "userProductId" = $1 AND "codeExamen" = $2
          AND lower("nom") = lower($3) AND lower("prenom") = lower($4)
          AND "dateNaissance" = $5::date AND "sortieAt" IS NULL
        RETURNING "id", "etat"`,
      [userProductId, codeExamen, nom, prenom, dateNaissance, telephone, sites],
    );
    if ((existant.rowCount ?? 0) > 0) {
      await client.query("COMMIT");
      return NextResponse.json({
        id: existant.rows[0].id,
        etat: existant.rows[0].etat,
        deja: true,
      });
    }

    // Idempotent sur la référence : un renvoi après coupure ne crée pas deux lignes.
    const res = await client.query<{ id: number; etat: string; cree: boolean }>(
      `INSERT INTO "KonnectFileAttente"
         ("userProductId", "codeExamen", "examenLibelle", "nom", "prenom", "dateNaissance",
          "telephone", "sites", "referenceKonnect")
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)
       ON CONFLICT ("userProductId", "referenceKonnect") DO UPDATE SET "updatedAt" = NOW()
       RETURNING "id", "etat", (xmax = 0) AS "cree"`,
      [
        userProductId,
        codeExamen,
        examenLibelle,
        nom,
        prenom,
        dateNaissance,
        telephone,
        sites,
        reference,
      ],
    );
    const ligne = res.rows[0];
    if (ligne.cree) {
      await client.query(
        `INSERT INTO "KonnectFileAttenteEvenement" ("userProductId", "inscriptionId", "codeExamen", "type")
         VALUES ($1, $2, $3, $4)`,
        [userProductId, ligne.id, codeExamen, EVENEMENTS.inscription],
      );
    }
    await client.query("COMMIT");

    auditLog("data", "konnect-file-attente-inscription", {
      actor: {
        id: null,
        email: null,
        role: "konnect",
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "userProduct", id: userProductId },
      metadata: { nouvelle: ligne.cree, sites: sites.length },
    });

    return NextResponse.json(
      { id: ligne.id, etat: ligne.etat, deja: !ligne.cree },
      { status: ligne.cree ? 201 : 200 },
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------- GET (Konnect)

/**
 * La file vivante, dans l'ordre d'inscription, plus les sorties qui laissent un RDV
 * d'attente à relire dans Xplore (secrétaire passée pendant une proposition, K11).
 * Aucun cache : Konnect relit à chaque passage, c'est la règle.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (!auth.bot) {
    return NextResponse.json(
      { error: "L'écran lit la file par /api/konnect-file-attente/ecran." },
      { status: 403 },
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 },
    );
  }

  const res = await db.query<InscriptionRow>(
    `SELECT ${COLONNES_INSCRIPTION}
       FROM "KonnectFileAttente"
      WHERE "userProductId" = $1
        AND ("sortieAt" IS NULL OR "rdvIdAttente" IS NOT NULL)
      ORDER BY "codeExamen", "createdAt", "id"`,
    [userProductId],
  );

  return NextResponse.json(
    {
      userProductId,
      inscriptions: res.rows.filter((r) => r.sortieAt === null),
      // RDV d'attente à relire dans Xplore : s'il porte encore la caractéristique
      // d'attente, Konnect le supprime puis envoie `rdv_attente_libere` ; s'il ne la
      // porte plus, la secrétaire a donné la place au patient et Konnect n'y touche
      // pas (il envoie aussi `rdv_attente_libere`, pour ne plus le relire).
      aNettoyer: res.rows
        .filter(rdvAttenteANettoyer)
        .map((r) => ({
          id: r.id,
          version: r.version,
          etat: r.etat,
          codeExamen: r.codeExamen,
          rdvIdAttente: r.rdvIdAttente,
        })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

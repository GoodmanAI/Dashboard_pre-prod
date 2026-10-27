export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import {
  auditLog,
  extractIpFromRequest,
  extractUserAgent,
} from "@/lib/auditLog";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import {
  GESTES_SECRETAIRE,
  type GesteSecretaire,
} from "@/lib/konnectFileAttente";
import {
  COLONNES_INSCRIPTION,
  appliquerGeste,
  estCentreKonnect,
  lireUserProductId,
  type InscriptionRow,
} from "@/lib/konnectFileAttenteServeur";

/**
 * Écran « Liste d'attente » du Dashboard (27/10/2026, lot L2).
 *
 *  GET  /api/konnect-file-attente/ecran?userProductId=NN   (session, lecture)
 *       → { codes: [{ codeExamen, examenLibelle, patients[] }], stats }
 *  POST /api/konnect-file-attente/ecran?userProductId=NN   (session, écriture)
 *       body : { id, geste: "traiter" | "retirer" }
 *
 * La secrétaire voit des créneaux que le portail ne voit pas (fermés à l'interface) :
 * elle appelle un patient de la file, lui donne une place et le marque traité, ou le
 * retire. Son geste passe par la même transition verrouillée que le moteur de
 * Konnect (`appliquerGeste`) : le premier arrivé gagne, et pendant les quelques
 * secondes où le patient confirme en ligne, son bouton répond 409.
 *
 * Les statistiques viennent des événements, qui n'ont aucune donnée patient et
 * survivent à la purge : elles couvrent tout l'historique.
 */

type Compte = { type: string; n: string };

async function statistiques(userProductId: number) {
  const res = await db.query<Compte>(
    `SELECT "type", COUNT(*)::text AS n FROM "KonnectFileAttenteEvenement"
      WHERE "userProductId" = $1 GROUP BY "type"`,
    [userProductId],
  );
  const n = (t: string) => Number(res.rows.find((r) => r.type === t)?.n ?? 0);
  const enFile = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "KonnectFileAttente"
      WHERE "userProductId" = $1 AND "sortieAt" IS NULL`,
    [userProductId],
  );
  return {
    inscrits: n("inscription"),
    enFile: Number(enFile.rows[0]?.n ?? 0),
    prisParLaFile: n("confirmation"),
    traitesSecretaire: n("traite_secretaire"),
    // Sortis sans rendez-vous, quelle qu'en soit la raison.
    jamaisPrisEnCharge:
      n("plus_besoin") +
      n("sortie_sans_reponse") +
      n("sortie_refus_repetes") +
      n("expire_60j") +
      n("retire_secretaire"),
    retiresSecretaire: n("retire_secretaire"),
    plusBesoin: n("plus_besoin"),
    expires: n("expire_60j"),
    smsEnvoyes: n("proposition"),
    // Un patient qui a cliqué, quoi qu'il ait répondu.
    smsRepondus:
      n("confirmation") +
      n("echec_confirmation") +
      n("refus_date") +
      n("plus_besoin"),
    smsSansReponse: n("delai_ecoule"),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  const ownershipErr = await assertUserProductOwnership(
    auth.session,
    userProductId,
  );
  if (ownershipErr) return ownershipErr;
  const droitErr = await requirePagePermission(
    PAGES.KONNECT_FILE_ATTENTE,
    "read",
  );
  if (droitErr) return droitErr;
  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 },
    );
  }

  const res = await db.query<InscriptionRow>(
    `SELECT ${COLONNES_INSCRIPTION} FROM "KonnectFileAttente"
      WHERE "userProductId" = $1 AND "sortieAt" IS NULL
      ORDER BY "codeExamen", "createdAt", "id"`,
    [userProductId],
  );

  // Une liste par code examen qui a au moins un patient (K12), dans l'ordre de la file.
  const parCode = new Map<
    string,
    { codeExamen: string; examenLibelle: string; patients: unknown[] }
  >();
  for (const r of res.rows) {
    let g = parCode.get(r.codeExamen);
    if (!g) {
      g = {
        codeExamen: r.codeExamen,
        examenLibelle: r.examenLibelle,
        patients: [],
      };
      parCode.set(r.codeExamen, g);
    }
    g.patients.push({
      id: r.id,
      rang: g.patients.length + 1,
      nom: r.nom,
      prenom: r.prenom,
      dateNaissance: r.dateNaissance,
      telephone: r.telephone,
      sites: r.sites,
      etat: r.etat,
      creneau: r.creneau,
      reponseAvant: r.reponseAvant,
      sansReponse: r.sansReponse,
      refusDate: r.refusDate,
      createdAt: r.createdAt,
    });
  }

  return NextResponse.json(
    {
      userProductId,
      codes: Array.from(parCode.values()).sort((a, b) =>
        a.examenLibelle.localeCompare(b.examenLibelle, "fr"),
      ),
      stats: await statistiques(userProductId),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  const ownershipErr = await assertUserProductOwnership(
    auth.session,
    userProductId,
  );
  if (ownershipErr) return ownershipErr;
  // Traiter ou retirer un patient est le travail d'une secrétaire : la page reste
  // accordable en écriture à un sous-compte.
  const droitErr = await requirePagePermission(
    PAGES.KONNECT_FILE_ATTENTE,
    "write",
  );
  if (droitErr) return droitErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = Number(body?.id);
  const geste = typeof body?.geste === "string" ? body.geste : "";
  if (!id)
    return NextResponse.json({ error: "`id` est requis." }, { status: 400 });
  if (!(geste in GESTES_SECRETAIRE)) {
    return NextResponse.json(
      { error: `Le geste « ${geste} » n'existe pas.` },
      { status: 400 },
    );
  }

  const res = await appliquerGeste(
    userProductId,
    id,
    geste as GesteSecretaire,
    {
      par: auth.session.user.email ?? null,
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: res.erreur, etat: res.etat },
      { status: res.statut },
    );
  }

  auditLog("data", "konnect-file-attente-secretaire", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { geste, etat: res.etat },
  });

  return NextResponse.json({ id: res.id, etat: res.etat });
}

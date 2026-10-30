import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest } from "@/lib/auditLog";
import { examensDuCentre, lireExceptionsSalles, lireSallesParType } from "@/lib/sallesExamen";
import { postAi2x, tunnelActif } from "@/lib/ai2xTunnel";
import {
  codesEnvoyes,
  etatFinal,
  libellesDesSalles,
  lignesEnregistrees,
  sallesRetenues,
  sitesDuType,
  typeRobot,
  type ReponseTest,
  type ResultatAi2x,
} from "@/lib/testCreneaux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bouton « Tester les créneaux » de la correspondance des examens de Talk.
 * Plan `plans/2026-10-tester-les-creneaux-depuis-le-dashboard.md`.
 *
 * Le navigateur n'envoie que `userProductId` et `codeExamen` (code NEURACORP de la
 * ligne). Codes Xplore, sites et salles sont relus EN BASE, tels que le robot les
 * lira : un écran ne peut pas viser un autre centre, ni tester une ligne qu'il n'a
 * pas enregistrée.
 *
 * Aucun cache, voulu (T10) : la secrétaire reteste juste après sa correction dans
 * Xplore. La charge est tenue par deux plafonds : 5 tests par minute et par personne,
 * 15 par centre. Le plafond par centre seul (5) bloquait une secrétaire quand ses
 * collègues testaient en même temps (Pontivy, 30/10).
 */

const PAR_PERSONNE = 5;
const PAR_CENTRE = 15;
const parPersonne = new Map<string, number[]>();
const parCentre = new Map<number, number[]>();

function recents<K>(compteur: Map<K, number[]>, cle: K, now: number): number[] {
  const liste = (compteur.get(cle) ?? []).filter((t) => now - t < 60000);
  compteur.set(cle, liste);
  return liste;
}

/**
 * Compteurs en mémoire du processus : le Dashboard tourne en un seul processus PM2.
 * Rend le plafond atteint, sinon compte le test et rend `null`.
 */
function plafondAtteint(userId: string, userProductId: number, now = Date.now()): "personne" | "centre" | null {
  const personne = recents(parPersonne, `${userProductId}:${userId}`, now);
  if (personne.length >= PAR_PERSONNE) return "personne";
  const centre = recents(parCentre, userProductId, now);
  if (centre.length >= PAR_CENTRE) return "centre";
  personne.push(now);
  centre.push(now);
  return null;
}

/** L'écran demande d'abord si la fonction est allumée : sinon, pas de bouton. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  return NextResponse.json({ actif: tunnelActif() });
}

export async function POST(req: NextRequest) {
  const droitErr = await requirePagePermission(PAGES.MAPPING_EXAM, "read");
  if (droitErr) return droitErr;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  if (!tunnelActif()) {
    return NextResponse.json({ error: "Le test des créneaux n'est pas activé." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const userProductId = Number(body?.userProductId);
  const codeExamen = typeof body?.codeExamen === "string" ? body.codeExamen.trim() : "";
  if (!codeExamen) {
    return NextResponse.json({ error: "codeExamen est requis" }, { status: 400 });
  }
  const ownershipErr = await assertUserProductOwnership(session, userProductId);
  if (ownershipErr) return ownershipErr;

  const plafond = plafondAtteint(String(session.user.id), userProductId);
  if (plafond) {
    auditLog("data", "test-creneaux", {
      actor: { id: session.user.id, email: session.user.email, role: session.user.role, ip: extractIpFromRequest(req) },
      target: { type: "userProduct", id: userProductId, label: codeExamen },
      success: false,
      errorReason: `trop_de_tests:${plafond}`,
    });
    return NextResponse.json({ error: "trop_de_tests", plafond }, { status: 429 });
  }

  const reponse = await tester(userProductId, codeExamen);

  auditLog("data", "test-creneaux", {
    actor: { id: session.user.id, email: session.user.email, role: session.user.role, ip: extractIpFromRequest(req) },
    target: { type: "userProduct", id: userProductId, label: codeExamen },
    metadata: {
      etat: reponse.etat,
      codeEnvoye: reponse.examen?.codeEnvoye ?? null,
      sites: reponse.sites?.codes ?? [],
      creneaux: reponse.creneaux?.length ?? 0,
      proposes: reponse.proposes ?? 0,
    },
  });

  return NextResponse.json(reponse);
}

async function tester(userProductId: number, codeExamen: string): Promise<ReponseTest> {
  const settings = await prisma.talkSettings.findUnique({
    where: { userProductId },
    select: { exams: true, options: true },
  });
  const lignes = lignesEnregistrees(settings?.exams ?? null);
  const ligne = lignes.find((l) => String(l.codeExamen ?? "") === codeExamen);
  if (!ligne) return { etat: "non_enregistre" };

  const codes = codesEnvoyes(ligne);
  const examen = {
    codeExamen,
    libelle: String(ligne.libelleClient || ligne.libelle || codeExamen),
    typeEnvoye: codes?.typeExamen ?? "",
    codeEnvoye: codes?.codeExamen ?? "",
    injecte: codes?.injecte ?? false,
    pratique: ligne.performed !== false,
  };
  if (!codes) return { etat: "sans_code", examen };

  const siteRes = await db.query<{ valeur: any }>(
    `SELECT "valeur" FROM "ProductConfig" WHERE "userProductId" = $1 AND "domaine" = 'talk.site' LIMIT 1`,
    [userProductId]
  );
  const site = siteRes.rows[0]?.valeur ?? null;
  const identifiantsRes = await db.query<{ code: string }>(
    `SELECT "externalCenterCode" AS "code" FROM "ExternalCenterMapping" WHERE "userProductId" = $1 ORDER BY "id"`,
    [userProductId]
  );

  const type = typeRobot(ligne.typeExamen);
  const sites = sitesDuType(site?.risCode, type, identifiantsRes.rows.map((r) => r.code));
  if (!sites) return { etat: "sans_site", examen };
  if ("ferme" in sites) return { etat: "type_ferme", examen };

  const salles = lireSallesParType(site?.sallesParType ?? null);
  const options = settings?.options && typeof settings.options === "object" ? (settings.options as any) : {};
  const exceptions = lireExceptionsSalles(options.exceptionsSalles, examensDuCentre(settings?.exams ?? null), salles);
  const retenues = sallesRetenues(ligne, salles, exceptions);
  const sallesInfo = { ...retenues, libelles: libellesDesSalles(salles, ligne.typeExamen) };

  let ai2x: ResultatAi2x;
  try {
    const { status, corps } = await postAi2x("/api/test/creneaux", {
      codesSite: sites.codes,
      typeExamen: codes.typeExamen,
      codeExamen: codes.codeExamen,
    });
    if (status !== 200 || !corps?.data?.etat) {
      console.error("[test-creneaux] AI2Xplore a répondu", status, corps?.error?.code ?? null);
      return { etat: "injoignable", examen, salles: sallesInfo };
    }
    ai2x = corps.data as ResultatAi2x;
  } catch (e: any) {
    console.error("[test-creneaux] tunnel injoignable :", e?.message);
    return { etat: "injoignable", examen, salles: sallesInfo };
  }

  return {
    ...etatFinal(ai2x, retenues.postes),
    examen,
    sites: {
      codes: sites.codes,
      source: sites.source,
      interroge: ai2x.codeSiteInterroge,
      inconnus: ai2x.sitesInconnus ?? [],
      parSite: ai2x.parSite ?? {},
    },
    salles: sallesInfo,
  };
}

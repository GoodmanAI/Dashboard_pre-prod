export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest } from "@/lib/auditLog";
import { tunnelActif, TunnelInjoignable } from "@/lib/ai2xTunnel";
import {
  enregistrerChoix,
  lireAnnuaire,
  lireReglage,
  relectureDue,
  relireAnnuaire,
  type ResultatRelecture,
} from "@/lib/medecinsAnnuaire";

/**
 * Carte « Nom du médecin » du paramétrage Talk (03/11/2026).
 * Plan `plans/2026-10-questions-sur-le-rdv-lyraetalk.md`, §7.
 *
 *   GET  ?userProductId=  → { actif, reluLe, relectureActive, medecins, relecture? }
 *                           relit d'abord si la dernière lecture a plus de 7 jours
 *   PUT  { userProductId, actif, nommes: { code: bool } }
 *   POST { userProductId }  → relit la liste dans Xplore (bouton « Relire »)
 *
 * Droit `parametrage` ; un sous-compte sans écriture lit sans enregistrer.
 */

const MESSAGES: Record<string, string> = {
  tunnel_eteint: "La lecture automatique n'est pas branchée sur ce serveur.",
  sans_site: "Aucun code de site n'est déclaré pour ce centre. Demandez à Lyrae de le renseigner.",
  xplore: "Votre logiciel de gestion n'a pas rendu la liste des médecins. Réessayez dans un instant.",
  trop_de_releves: "Trop de lectures en une minute. Réessayez dans un instant.",
  injoignable: "La liste n'a pas pu être relue : la passerelle ne répond pas. Réessayez dans un instant.",
};

async function cible(req: NextRequest, niveau: "read" | "write", userProductId: number) {
  const droitErr = await requirePagePermission(PAGES.PARAMETRAGE, niveau);
  if (droitErr) return { error: droitErr };
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };
  if (!userProductId || !Number.isInteger(userProductId)) {
    return { error: NextResponse.json({ error: "userProductId est requis" }, { status: 400 }) };
  }
  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return { error: ownershipErr };
  return { session: auth.session };
}

async function relireSansCasser(userProductId: number): Promise<ResultatRelecture | { ok: false; raison: "injoignable" }> {
  try {
    return await relireAnnuaire(userProductId);
  } catch (e) {
    if (e instanceof TunnelInjoignable) return { ok: false, raison: "injoignable" };
    throw e;
  }
}

function resumeRelecture(r: Awaited<ReturnType<typeof relireSansCasser>>) {
  return r.ok
    ? { ok: true, lus: r.lus, nouveaux: r.nouveaux }
    : { ok: false, message: MESSAGES[r.raison] ?? MESSAGES.xplore };
}

export async function GET(req: NextRequest) {
  const userProductId = Number(new URL(req.url).searchParams.get("userProductId"));
  const c = await cible(req, "read", userProductId);
  if (c.error) return c.error;

  let relecture: ReturnType<typeof resumeRelecture> | null = null;
  let reglage = await lireReglage(userProductId);
  if (tunnelActif() && relectureDue(reglage)) {
    relecture = resumeRelecture(await relireSansCasser(userProductId));
    reglage = await lireReglage(userProductId);
  }
  const medecins = await lireAnnuaire(userProductId);
  return NextResponse.json({
    actif: reglage.actif,
    reluLe: reglage.reluLe,
    relectureActive: tunnelActif(),
    medecins,
    relecture,
  });
}

export async function PUT(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  const userProductId = Number(corps?.userProductId);
  const c = await cible(req, "write", userProductId);
  if (c.error) return c.error;

  if (typeof corps?.actif !== "boolean") {
    return NextResponse.json({ error: "Le choix de la case est manquant." }, { status: 400 });
  }
  const brut = corps?.nommes && typeof corps.nommes === "object" ? corps.nommes : {};
  const nommes: Record<string, boolean> = {};
  for (const [code, v] of Object.entries(brut)) {
    if (typeof code === "string" && code.length <= 40) nommes[code] = v === true;
  }
  if (Object.keys(nommes).length > 500) {
    return NextResponse.json({ error: "Liste trop longue." }, { status: 400 });
  }

  await enregistrerChoix(userProductId, corps.actif, nommes);
  const nombreNommes = Object.values(nommes).filter(Boolean).length;
  auditLog("data", "talk-medecins", {
    actor: { id: c.session.user.id, email: c.session.user.email, role: c.session.user.role, ip: extractIpFromRequest(req) },
    target: { type: "userProduct", id: userProductId, label: "medecins-nommes" },
    metadata: { actif: corps.actif, nommes: nombreNommes, lignes: Object.keys(nommes).length },
  });

  const reglage = await lireReglage(userProductId);
  return NextResponse.json({
    actif: reglage.actif,
    reluLe: reglage.reluLe,
    relectureActive: tunnelActif(),
    medecins: await lireAnnuaire(userProductId),
  });
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  const userProductId = Number(corps?.userProductId);
  const c = await cible(req, "read", userProductId);
  if (c.error) return c.error;

  if (!tunnelActif()) {
    return NextResponse.json({ error: MESSAGES.tunnel_eteint }, { status: 503 });
  }
  const r = await relireSansCasser(userProductId);
  auditLog("data", "talk-medecins-relecture", {
    actor: { id: c.session.user.id, email: c.session.user.email, role: c.session.user.role, ip: extractIpFromRequest(req) },
    target: { type: "userProduct", id: userProductId, label: "medecins-relecture" },
    success: r.ok,
    ...(r.ok ? { metadata: { lus: r.lus, nouveaux: r.nouveaux } } : { errorReason: r.raison }),
  });
  if (!r.ok) {
    const status = r.raison === "trop_de_releves" ? 429 : r.raison === "sans_site" ? 409 : 502;
    return NextResponse.json({ error: MESSAGES[r.raison] ?? MESSAGES.xplore }, { status });
  }
  const reglage = await lireReglage(userProductId);
  return NextResponse.json({
    actif: reglage.actif,
    reluLe: reglage.reluLe,
    relectureActive: true,
    medecins: await lireAnnuaire(userProductId),
    relecture: { ok: true, lus: r.lus, nouveaux: r.nouveaux },
  });
}

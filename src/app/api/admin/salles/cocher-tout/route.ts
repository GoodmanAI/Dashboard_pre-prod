export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { postAi2x, tunnelActif, TunnelInjoignable } from "@/lib/ai2xTunnel";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { lireReleve } from "@/lib/konnectSalles";
import { planAEcrire, planCocherTout, type SalleReleveeSite } from "@/lib/sallesFacturees";
import { clientSalles, ecrireSallesDuClient, sallesDuClient } from "@/lib/sallesFactureesLecture";

/**
 * POST /api/admin/salles/cocher-tout  { userId, appliquer }
 *
 * Première mise en production des salles facturées (Enzo, 02/11/2026) : pour UN client,
 * relève les salles de chacun de ses sites dans Xplore, les ajoute à sa liste et coche
 * chaque produit qu'il a (`planCocherTout`, gardes comprises). L'écran Facturation
 * appelle cette route client par client, d'abord à blanc (`appliquer: false`, rien
 * n'est écrit), puis pour de bon. Admin seul, audit à chaque écriture.
 *
 * Réponse : { client, sitesReleves, sitesEnEchec, plan (sans la liste), ecrit, diff }.
 * 429 : le plafond du relevé d'AI2Xplore (20 par minute) ; l'écran attend et reprend.
 */

class Plafond extends Error {}

async function releverSite(codeSite: string): Promise<SalleReleveeSite[] | null> {
  const { status, corps } = await postAi2x("/api/test/salles", { codeSite });
  if (status === 429) throw new Plafond();
  if (status !== 200 || !Array.isArray(corps?.data?.postes)) return null;
  const texte = (corps.data.postes as unknown[]).filter((p) => typeof p === "string").join(";");
  return lireReleve(texte).map((s) => ({ codeSite, poste: s.poste, libelle: s.libelle, type: s.type }));
}

/** `konnect.salles` déclarait des salles sans en ouvrir aucune (tout au rappel). */
async function konnectFermeAvant(userProductId: number | null): Promise<boolean> {
  if (userProductId === null) return false;
  const r = await db.query<{ valeur: any }>(
    `SELECT "valeur" FROM "ProductConfig" WHERE "userProductId" = $1 AND "domaine" = 'konnect.salles'`,
    [userProductId]
  );
  const v = r.rows[0]?.valeur;
  if (!v || typeof v !== "object") return false;
  const declarees = Object.values(v.sallesParType ?? {}).some((l) => Array.isArray(l) && l.length > 0);
  const ouvertes = Array.isArray(v.ouvertes) ? v.ouvertes.length : 0;
  return declarees && ouvertes === 0;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  if (!tunnelActif()) {
    return NextResponse.json(
      { error: "Le relevé automatique n'est pas branché sur ce serveur. Réglez les salles client par client." },
      { status: 503 }
    );
  }

  const corps = await req.json().catch(() => null);
  const userId = Number(corps?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Client manquant." }, { status: 400 });
  }
  const appliquer = corps?.appliquer === true;

  const client = await clientSalles(userId);
  if (!client) return NextResponse.json({ error: "Ce client n'existe pas." }, { status: 404 });
  const lignes = await sallesDuClient(userId);
  if (lignes === null) {
    return NextResponse.json(
      { error: "La table des salles n'existe pas encore sur ce serveur. Passez le SQL du 02/11 d'abord." },
      { status: 503 }
    );
  }

  const releve: SalleReleveeSite[] = [];
  const sitesReleves: string[] = [];
  const sitesEnEchec: string[] = [];
  try {
    for (const site of client.sites) {
      const salles = await releverSite(site);
      if (salles === null) sitesEnEchec.push(site);
      else {
        sitesReleves.push(site);
        releve.push(...salles);
      }
    }
  } catch (e) {
    if (e instanceof Plafond) {
      return NextResponse.json({ error: "Trop de relevés en une minute.", plafond: true }, { status: 429 });
    }
    if (e instanceof TunnelInjoignable) {
      return NextResponse.json({ error: "La passerelle ne répond pas. Réessayez dans un instant." }, { status: 502 });
    }
    throw e;
  }

  const reglages =
    client.produits.talk !== null
      ? await prisma.talkSettings.findUnique({
          where: { userProductId: client.produits.talk },
          select: { examsAccepted: true },
        })
      : null;

  const plan = planCocherTout({
    lignes,
    releve,
    produits: { talk: client.produits.talk !== null, konnect: client.produits.konnect !== null },
    examsAccepted: reglages?.examsAccepted ?? {},
    konnectFermeAvant: await konnectFermeAvant(client.produits.konnect),
  });
  // Un site en échec : on n'écrit rien pour ce client, son relevé est incomplet.
  const aEcrire = planAEcrire(plan) && sitesEnEchec.length === 0;

  let diff = null;
  if (appliquer && aEcrire) {
    diff = await ecrireSallesDuClient(userId, plan.salles);
    auditLog("account", "salles-facturees", {
      actor: {
        id: auth.session.user.id,
        email: auth.session.user.email ?? null,
        role: auth.session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "user", id: String(userId), label: client.nom },
      metadata: {
        ...diff,
        origine: "cocher-tout",
        talk: plan.talk,
        konnect: plan.konnect,
        sallesTalk: plan.salles.filter((s) => s.talk).length,
        sallesKonnect: plan.salles.filter((s) => s.konnect).length,
      },
    });
  }

  const { salles, ...resume } = plan;
  return NextResponse.json({
    client: { userId, nom: client.nom, sites: client.sites },
    sitesReleves,
    sitesEnEchec,
    plan: {
      ...resume,
      salles: salles.length,
      sallesTalk: salles.filter((s) => s.talk).length,
      sallesKonnect: salles.filter((s) => s.konnect).length,
    },
    aEcrire,
    ecrit: diff !== null,
    diff,
  });
}

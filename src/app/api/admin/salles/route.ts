export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { tunnelActif } from "@/lib/ai2xTunnel";
import { facturer, validerSalles } from "@/lib/sallesFacturees";
import {
  clientSalles,
  ecrireSallesDuClient,
  lireTarifs,
  sallesDuClient,
} from "@/lib/sallesFactureesLecture";

/**
 * Les salles d'un client et celles qu'il paie, par produit. Écran admin « Salles et
 * facturation ». Plan `plans/2026-11-salles-facturees-talk-konnect.md`.
 *
 *   GET /api/admin/salles?userId=NN
 *     → { client, salles, tarifs, facture, releve: bool, tableAbsente: bool }
 *   PUT /api/admin/salles  { userId, salles: [{ codeSite, poste, typeExamen, libelle,
 *                                               talk, konnect }] }
 *     → la liste remplace l'ancienne ; même réponse que le GET.
 *
 * Admin seul : c'est l'engagement commercial du client, jamais un réglage du centre.
 * Chaque écriture part à l'audit (postes ajoutés, retirés, modifiés, nombre de salles
 * par produit), base d'un historique de facturation.
 */

async function etat(userId: number) {
  const client = await clientSalles(userId);
  if (!client) return null;
  const [lignes, tarifs] = await Promise.all([sallesDuClient(userId), lireTarifs()]);
  return {
    client,
    salles: lignes ?? [],
    tarifs,
    facture: facturer(lignes ?? [], tarifs),
    releve: tunnelActif(),
    tableAbsente: lignes === null,
  };
}

function lireUserId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const userId = lireUserId(new URL(req.url).searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Client manquant." }, { status: 400 });

  const e = await etat(userId);
  if (!e) return NextResponse.json({ error: "Ce client n'existe pas." }, { status: 404 });
  return NextResponse.json(e, { headers: { "Cache-Control": "no-cache" } });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const corps = await req.json().catch(() => null);
  const userId = lireUserId(corps?.userId);
  if (!userId) return NextResponse.json({ error: "Client manquant." }, { status: 400 });

  const valide = validerSalles(corps?.salles);
  if ("erreur" in valide) return NextResponse.json({ error: valide.erreur }, { status: 400 });

  const client = await clientSalles(userId);
  if (!client) return NextResponse.json({ error: "Ce client n'existe pas." }, { status: 404 });
  for (const p of ["talk", "konnect"] as const) {
    if (client.produits[p] === null && valide.valeur.some((s) => s[p])) {
      return NextResponse.json(
        {
          error: `Ce client n'a pas ${p === "talk" ? "Talk" : "Konnect"}. Ouvrez le produit avant de lui attribuer des salles.`,
        },
        { status: 400 }
      );
    }
  }

  let diff;
  try {
    diff = await ecrireSallesDuClient(userId, valide.valeur);
  } catch (e) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "La table des salles n'existe pas encore sur ce serveur. Passez le SQL du 02/11 avant d'enregistrer." },
        { status: 503 }
      );
    }
    console.error("[admin/salles] écriture impossible :", e);
    return NextResponse.json(
      { error: "Les salles n'ont pas pu être enregistrées. Réessayez dans un instant." },
      { status: 500 }
    );
  }

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
      sallesTalk: valide.valeur.filter((s) => s.talk).length,
      sallesKonnect: valide.valeur.filter((s) => s.konnect).length,
    },
  });

  return NextResponse.json(await etat(userId));
}

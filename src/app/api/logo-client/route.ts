export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import {
  TYPES_APERCU,
  clientDuProduit,
  ecrireLogoClient,
  empreinteLogo,
  erreurFichierLogo,
  lireLogoClient,
  retirerLogoClient,
} from "@/lib/logoClient";

/**
 * Logo du client, commun à Talk et Konnect (28/11/2026), réglé depuis le Paramétrage de
 * l'un ou l'autre produit. Plan `lyrae/plans/2026-11-logo-du-client.md`.
 *
 *  GET    /api/logo-client?userProductId=NN            → l'image (404 sans logo)
 *  GET    /api/logo-client?userProductId=NN&infos=1    → { present, type, nom, octets, maj, dansLesSms }
 *  PUT    /api/logo-client?userProductId=NN            (multipart, champ `fichier`)
 *  DELETE /api/logo-client?userProductId=NN
 *
 * Session seulement (le portail Konnect garde sa route, `/api/konnect-logo`). Droit du
 * Paramétrage de Talk ou de Konnect : le logo appartient au client, pas à un produit.
 */

async function cible(
  req: NextRequest,
  niveau: "read" | "write"
): Promise<{ erreur: NextResponse } | { userId: number; acteur: any; userProductId: number }> {
  const auth = await requireAuth();
  if (auth.error) return { erreur: auth.error };
  const userProductId = Number(req.nextUrl.searchParams.get("userProductId"));
  if (!userProductId || Number.isNaN(userProductId)) {
    return { erreur: NextResponse.json({ error: "userProductId manquant" }, { status: 400 }) };
  }
  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return { erreur: ownErr };
  const droitErr = await requireAnyPagePermission(
    [PAGES.PARAMETRAGE, PAGES.KONNECT_PARAMETRAGE],
    niveau
  );
  if (droitErr) return { erreur: droitErr };
  const userId = await clientDuProduit(userProductId);
  if (!userId) {
    return { erreur: NextResponse.json({ error: "Aucun centre pour cet identifiant" }, { status: 404 }) };
  }
  return { userId, acteur: auth.session.user, userProductId };
}

function acteurAudit(req: NextRequest, u: any) {
  return {
    id: u.id,
    email: u.email ?? null,
    role: u.role,
    ip: extractIpFromRequest(req),
    userAgent: extractUserAgent(req),
  };
}

export async function GET(req: NextRequest) {
  const c = await cible(req, "read");
  if ("erreur" in c) return c.erreur;
  const { logo } = await lireLogoClient(c.userId);

  if (req.nextUrl.searchParams.get("infos")) {
    return NextResponse.json({
      present: Boolean(logo),
      type: logo?.type ?? null,
      nom: logo?.nom ?? null,
      octets: logo?.contenu.length ?? 0,
      maj: logo?.maj ?? null,
      // Le SVG s'affiche dans Konnect mais pas dans l'aperçu d'un lien SMS.
      dansLesSms: logo ? TYPES_APERCU.has(logo.type) : false,
    });
  }

  if (!logo) return NextResponse.json({ error: "Ce centre n'a pas de logo" }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.contenu), {
    status: 200,
    headers: {
      "Content-Type": logo.type,
      "Content-Length": String(logo.contenu.length),
      ETag: empreinteLogo(logo.maj, logo.contenu.length),
      "Cache-Control": "no-cache",
    },
  });
}

export async function PUT(req: NextRequest) {
  const c = await cible(req, "write");
  if ("erreur" in c) return c.erreur;

  const formData = await req.formData().catch(() => null);
  const fichier = formData?.get("fichier");
  if (!formData || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  const erreur = erreurFichierLogo(fichier);
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });

  await ecrireLogoClient(c.userId, fichier);
  // Volume et type seulement : journaliser l'image n'apprendrait rien.
  auditLog("data", "logo-client-depot", {
    actor: acteurAudit(req, c.acteur),
    target: { type: "user", id: c.userId },
    metadata: { type: fichier.type, octets: fichier.size, userProductId: c.userProductId },
  });
  return NextResponse.json({
    ok: true,
    type: fichier.type,
    nom: fichier.name.slice(0, 200),
    octets: fichier.size,
    dansLesSms: TYPES_APERCU.has(fichier.type),
  });
}

export async function DELETE(req: NextRequest) {
  const c = await cible(req, "write");
  if ("erreur" in c) return c.erreur;
  await retirerLogoClient(c.userId);
  auditLog("data", "logo-client-retrait", {
    actor: acteurAudit(req, c.acteur),
    target: { type: "user", id: c.userId },
    metadata: { userProductId: c.userProductId },
  });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { konnectDuClient, urlRdvEnLigne } from "@/lib/rdvEnLigneLecture";

/**
 * Carte « Prise de rendez-vous en ligne » du paramétrage Talk (18/11/2026, ponts de
 * Talk vers Konnect, plan `plans/2026-11-ponts-talk-konnect.md`).
 *
 *   GET ?userProductId=  (affiliation Talk)  → { konnect: boolean, url: string | null }
 *
 * Lecture seule : l'adresse se règle à l'installation de Konnect, par l'équipe. La
 * carte s'en sert pour se montrer (client avec Konnect) et pour l'aperçu du SMS, dont
 * le texte s'enregistre dans `talk.textes`. Droit `parametrage`.
 */
export async function GET(req: NextRequest) {
  const droitErr = await requirePagePermission(PAGES.PARAMETRAGE, "read");
  if (droitErr) return droitErr;
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = Number(new URL(req.url).searchParams.get("userProductId"));
  if (!userProductId || !Number.isInteger(userProductId)) {
    return NextResponse.json({ error: "userProductId est requis" }, { status: 400 });
  }
  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  const konnect = await konnectDuClient(userProductId);
  const url = konnect === null ? null : await urlRdvEnLigne(konnect);
  return NextResponse.json({ konnect: konnect !== null, url });
}

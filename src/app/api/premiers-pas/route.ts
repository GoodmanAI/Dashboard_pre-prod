export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { appliquer, lireEtat } from "@/lib/premiersPas";

/**
 * Ce que la personne connectée a fait de ses premiers pas (plan
 * `2026-10-onboarding-dashboard-talk.md`).
 *
 *  GET   /api/premiers-pas  → { etat }
 *  PATCH /api/premiers-pas  { masque } | { lu } | { phrase }  → { etat }
 *
 * **Chacun ne lit et n'écrit que sa propre ligne**, prise dans la session : aucun
 * identifiant dans la requête, donc rien à vérifier d'autre. Les étapes faites ne
 * sont pas ici : elles viennent de `/api/completude`, recalculées à chaque lecture.
 *
 * Un administrateur ne voit jamais la carte (elle masquerait l'écran du client qu'il
 * vient lire) : la route le lui dit par `admin: true` et n'écrit rien pour lui.
 * Pas d'`auditLog` : une préférence d'affichage n'est pas une mutation sensible.
 */

function estAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth.session;

  if (estAdmin(user.role)) {
    return NextResponse.json({ admin: true, etat: lireEtat({ masque: true }) });
  }

  const ligne = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { premiersPas: true },
  });
  return NextResponse.json({
    admin: false,
    etat: lireEtat(ligne?.premiersPas ?? null),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth.session;

  if (estAdmin(user.role)) {
    return NextResponse.json({ admin: true, etat: lireEtat({ masque: true }) });
  }

  const corps = await req.json().catch(() => null);
  const id = Number(user.id);
  const ligne = await prisma.user.findUnique({
    where: { id },
    select: { premiersPas: true },
  });
  const suivant = appliquer(lireEtat(ligne?.premiersPas ?? null), corps);
  if (!suivant) {
    return NextResponse.json(
      { error: "Action inconnue. Attendu : masque, lu ou phrase." },
      { status: 400 },
    );
  }

  await prisma.user.update({ where: { id }, data: { premiersPas: suivant } });
  return NextResponse.json({ admin: false, etat: suivant });
}

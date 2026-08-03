import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { hasPermission, PageKey } from "@/lib/permissions";

/**
 * Refuse l'accès si la session courante correspond à un compte Secrétaire.
 * Retourne null si l'écriture est autorisée, ou une NextResponse 403 sinon.
 * À appeler en début de handler des routes API d'écriture (POST/PUT/PATCH/DELETE).
 *
 * NOTE : conserve pour retrocompat. Nouveau code : preferer requirePagePermission()
 * qui gere isSecretary + permissions granulaires (sous-comptes chantier 3).
 */
export async function rejectIfSecretary() {
  const session = await getServerSession(authOptions);
  if (session?.user?.isSecretary) {
    return NextResponse.json(
      { error: "Lecture seule : les comptes Secrétaire ne peuvent pas modifier la configuration." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Verifie que la session a le niveau d'acces demande sur une page.
 * Utilise hasPermission() : gere SUPER_ADMIN/ADMIN (bypass), CLIENT principal
 * (bypass), CLIENT sous-compte (permissions JSON granulaires), CLIENT
 * isSecretary retrocompat (read seul sur pages parametrage).
 *
 * Retourne :
 *   - null si l'acces est autorise
 *   - NextResponse 401 si pas de session
 *   - NextResponse 403 si acces refuse
 *
 * Usage :
 *   const err = await requirePagePermission(PAGES.PARAMETRAGE, "write");
 *   if (err) return err;
 */
export async function requirePagePermission(
  page: PageKey,
  level: "read" | "write"
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user as any, page, level)) {
    return NextResponse.json(
      {
        error:
          level === "write"
            ? "Vous n'avez pas les droits en ecriture sur cette section."
            : "Vous n'avez pas acces a cette section.",
      },
      { status: 403 }
    );
  }
  return null;
}

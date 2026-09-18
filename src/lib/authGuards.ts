import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { hasPermission, PageKey } from "@/lib/permissions";

/*
 * `rejectIfSecretary()` a été retirée le 14/09/2026, après migration de ses dix
 * appelants vers `requirePagePermission(PAGE, "write")`.
 *
 * **Ce n'était pas un renommage.** Elle ne lisait que le booléen hérité
 * `User.isSecretary` et **ignorait complètement le JSON `permissions`** : un
 * sous-compte moderne créé en lecture seule passait donc au travers, ouvrait
 * l'écran, saisissait, cliquait sur Enregistrer, et l'écriture partait. Son propre
 * commentaire demandait cette bascule depuis le chantier 3 ; personne ne l'avait
 * faite, et `requirePagePermission` n'était appelée par aucune route du dépôt.
 *
 * Depuis le 18/09/2026 le booléen `isSecretary` n'est plus lu du tout : un compte
 * secrétaire porte le préréglage `presetSecretaire()` en clair, et n'est restreint que
 * par lui. Voir `prisma/migrations/manual/2026_09_18_is_secretary_plus_lu.sql`.
 */

/**
 * Verifie que la session a le niveau d'acces demande sur une page.
 * Utilise hasPermission() : gere SUPER_ADMIN/ADMIN (bypass), CLIENT principal
 * (bypass), CLIENT avec permissions (JSON granulaire, sous-compte ou secretaire).
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

/**
 * Même chose, mais pour une route que PLUSIEURS écrans consomment : l'accès passe
 * dès qu'une seule des pages citées est accordée au niveau demandé.
 *
 * **Pourquoi cette variante existe** (14/09/2026). Quelques routes de lecture
 * alimentent plusieurs écrans : `/api/calls` sert les écrans Appels, Incidents et
 * Statistiques d'appels ; `/api/konnect-examens` sert cinq écrans Konnect. Exiger
 * une page unique y couperait un sous-compte légitime, par exemple celui qui n'a
 * qu'« Incidents » et à qui l'on demanderait le droit « Appels ». Exiger la page la
 * plus large ferait l'inverse, en ouvrant trop.
 *
 * ⚠️ **À réserver à la LECTURE.** Une écriture doit nommer sa page, une seule :
 * « au moins une de » sur un `POST` reviendrait à laisser un droit accordé pour un
 * écran en ouvrir un autre.
 */
export async function requireAnyPagePermission(
  pages: PageKey[],
  level: "read" | "write"
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const autorise = pages.some((page) => hasPermission(session.user as any, page, level));
  if (!autorise) {
    return NextResponse.json(
      { error: "Vous n'avez pas acces a cette section." },
      { status: 403 }
    );
  }
  return null;
}

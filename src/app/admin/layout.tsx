import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * Garde serveur de tout l'espace `/admin`.
 *
 * **Pourquoi ce fichier existe** (ajouté le 14/09/2026, lot 2 sécurité).
 * Jusqu'ici, `src/middleware.ts` était la SEULE couche devant les dix-huit pages
 * d'administration. Les gardes qu'on trouve dans certaines pages
 * (`admin/users/page.tsx`, `admin/overview/page.tsx`…) sont des `useEffect` qui
 * redirigent côté navigateur : elles servent le confort, pas la sécurité, et un
 * `router.push` ne protège rien puisque le rendu a déjà eu lieu.
 *
 * Le jour où le `matcher` du middleware change, ou bien où une page admin naît
 * sous un chemin que son motif ne couvre pas, tout s'ouvre d'un coup sans qu'un
 * seul test ne le dise. Ce layout est la seconde couche : il s'exécute sur le
 * serveur, avant le rendu, pour toute page de l'arborescence.
 *
 * **Il ne remplace pas les gardes de route.** Chaque `route.ts` sous
 * `/api/admin/` garde sa propre vérification : une page protégée n'a jamais
 * protégé l'API qui l'alimente.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) {
    redirect("/authentication/signin");
  }

  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    // Un compte client qui tape une URL `/admin/...` repart chez lui plutôt que
    // sur une page d'erreur : il n'a rien fait de mal, il s'est trompé d'adresse.
    redirect("/");
  }

  return <>{children}</>;
}

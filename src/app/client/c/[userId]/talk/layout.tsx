// app/client/c/[userId]/talk/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";

/**
 * Segment LyraeTalk (lot U3).
 *
 * `[userId]` est le CLIENT, pas son affiliation au produit. Le `userProductId`
 * qu'attendent les routes API est résolu par l'adaptateur `page.tsx` de chaque
 * écran, seul endroit à faire cette traduction.
 */
export default async function TalkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { userId: string };
}) {
  // Défense en profondeur : le middleware gère déjà l'auth sur /client/*,
  // mais on re-vérifie ici côté server component au cas où.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/authentication/signin");
  }

  if (!Number.isFinite(Number(params.userId))) {
    redirect("/authentication/signin");
  }

  return <>{children}</>;
}

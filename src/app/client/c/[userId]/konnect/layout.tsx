// app/client/c/[userId]/konnect/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import ThemeKonnect from "./ThemeKonnect";
import GardeProduit from "./GardeProduit";

/**
 * Segment LyraeKonnect (lot U2).
 *
 * `[userId]` est le CLIENT, pas son affiliation au produit. Le `userProductId`
 * qu'attendent les routes API est résolu côté page par `useCentreProduit`, qui est
 * le seul endroit à faire cette traduction.
 *
 * Ce layout ne la fait donc pas, et c'est voulu : il tourne côté serveur à chaque
 * navigation, et y ajouter une requête de résolution mettrait un aller-retour base
 * devant chaque écran pour une valeur dont il n'a aucun usage.
 */
export default async function KonnectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { userId: string };
}) {
  // Défense en profondeur : le middleware garde déjà /client/*, on revérifie
  // côté server component.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/authentication/signin");
  }

  if (!Number.isFinite(Number(params.userId))) {
    redirect("/authentication/signin");
  }

  return (
    <>
      <ThemeKonnect />
      <GardeProduit>{children}</GardeProduit>
    </>
  );
}

// app/client/services/konnect/[id]/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import ThemeKonnect from "./ThemeKonnect";

/**
 * Segment LyraeKonnect. Calqué sur `talk/[id]/layout.tsx` : `[id]` est le
 * `userProductId` du centre pour CE produit — pas celui de LyraeTalk, qui est
 * une autre ligne de `UserProduct` avec un autre identifiant.
 */
export default async function KonnectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  // Défense en profondeur : le middleware garde déjà /client/*, on revérifie
  // côté server component.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/authentication/signin");
  }

  const userProductId = Number(params.id);
  if (Number.isNaN(userProductId)) {
    redirect("/authentication/signin");
  }

  return (
    <>
      <ThemeKonnect />
      {children}
    </>
  );
}

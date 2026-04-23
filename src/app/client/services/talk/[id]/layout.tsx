// app/client/services/talk/[id]/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";

export default async function TalkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  // Défense en profondeur : le middleware gère déjà l'auth sur /client/*,
  // mais on re-vérifie ici côté server component au cas où.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/authentication/signin");
  }

  const userProductId = Number(params.id);
  if (Number.isNaN(userProductId)) {
    redirect("/authentication/signin");
  }

  return <>{children}</>;
}

// app/client/services/talk/[id]/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

export default async function TalkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const userProductId = Number(params.id);
  if (Number.isNaN(userProductId)) {
    redirect("/");
  }

  const userProduct = await prisma.userProduct.findFirst({
    where: {
      id: userProductId,
      userId: session.user.id,
      removedAt: null,
    },
  });

  if (!userProduct) {
    redirect("/");
  }

  // ✅ TOUJOURS retourner children
  return <>{children}</>;
}

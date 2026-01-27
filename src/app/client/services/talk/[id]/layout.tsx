// app/client/services/talk/[id]/layout.tsx
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

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
    redirect("/login3");
  }

  const userProductId = Number(params.id);
  if (Number.isNaN(userProductId)) {
    redirect("/login");
  }

  const cookieStore = cookies();
  const activeUserId = Number(cookieStore.get("activeUserId")?.value);

  const effectiveUserId = activeUserId || session.user.id;

  const userProduct = await prisma.userProduct.findFirst({
    where: {
      id: userProductId,
      userId: effectiveUserId,
      removedAt: null,
    },
  });

  // ✅ TOUJOURS retourner children
  return <>{children}</>;
}

export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/lib/db";
import { cheminCentre } from "@/lib/cheminsCentre";

/**
 * Les anciennes URL d'administration d'un centre redirigent (lot U5).
 *
 * `/admin/clients/{userProductId}/...` n'existait que pour ré-exporter les écrans
 * du client sous un autre préfixe. Rien dans leur rendu ne dépendait de ce
 * préfixe : ce qu'un admin voit de plus lui vient de sa session et de son menu.
 * Les deux espaces partagent donc une seule adresse, `/client/c/{userId}/talk`.
 *
 * Ces liens-là sont internes, mais un admin garde des onglets ouverts comme tout
 * le monde, et un 404 sur une console d'exploitation coûte plus de temps qu'il
 * n'en fait gagner.
 */
export default async function RedirectionAdminClient({
  params,
}: {
  params: { userProductId: string; reste?: string[] };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/authentication/signin");

  const userProductId = Number(params.userProductId);
  if (!Number.isFinite(userProductId)) redirect("/admin/overview");

  const res = await db.query<{ userId: number }>(
    `SELECT "userId" FROM "UserProduct" WHERE "id" = $1`,
    [userProductId]
  );

  const userId = res.rows[0]?.userId;
  if (!userId) redirect("/admin/overview");

  redirect(cheminCentre(userId, "talk", (params.reste ?? []).join("/")));
}

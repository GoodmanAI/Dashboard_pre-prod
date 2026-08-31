export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/lib/db";
import { cheminCentre } from "@/lib/cheminsCentre";

/**
 * Les anciennes URL LyraeTalk continuent de marcher (lot U5).
 *
 * `/client/services/talk/{userProductId}/...` a été remplacé par
 * `/client/c/{userId}/talk/...` : l'adresse porte désormais le client et non son
 * affiliation à un produit.
 *
 * CELLE-CI COMPTE PLUS QUE SON PENDANT KONNECT. LyraeTalk est en production
 * depuis longtemps, et ses URL circulent : signets de secrétaires, liens dans des
 * courriels, onglets restés ouverts. Les casser se verrait tout de suite, et pour
 * des gens qui n'ont aucun moyen de comprendre ce qui s'est passé.
 *
 * Le catch-all est optionnel, donc `/client/services/talk/23` tout court est
 * couvert autant que `/client/services/talk/23/parametrage/mapping_exam`.
 *
 * PAS DE CONTRÔLE D'ACCÈS ICI au-delà de la session : on ne fait que traduire une
 * adresse. C'est la destination qui décide qui a le droit d'y entrer, via
 * `assertUserAccess` sur la route de résolution et `PageAccessGuard` sur l'écran.
 */
export default async function RedirectionTalk({
  params,
}: {
  params: { id: string; reste?: string[] };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/authentication/signin");

  const userProductId = Number(params.id);
  if (!Number.isFinite(userProductId)) redirect("/client");

  const res = await db.query<{ userId: number }>(
    `SELECT "userId" FROM "UserProduct" WHERE "id" = $1`,
    [userProductId]
  );

  const userId = res.rows[0]?.userId;
  // Affiliation supprimée depuis que le lien a été envoyé : mieux vaut poser
  // l'utilisateur sur son accueil que de le laisser sur une adresse morte.
  if (!userId) redirect("/client");

  redirect(cheminCentre(userId, "talk", (params.reste ?? []).join("/")));
}

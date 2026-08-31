export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/lib/db";
import { cheminCentre } from "@/lib/cheminsCentre";

/**
 * Les anciennes URL Konnect continuent de marcher (lot U5).
 *
 * `/client/services/konnect/{userProductId}/...` a été remplacé par
 * `/client/c/{userId}/konnect/...` : l'adresse porte désormais le client et non
 * son affiliation à un produit.
 *
 * ON NE CASSE PAS LES LIENS DÉJÀ PARTIS. Un signet, un courriel envoyé à une
 * secrétaire, un onglet resté ouvert depuis hier : ils portent tous l'ancienne
 * forme, et rien ne dit à leur destinataire pourquoi la page a disparu. La
 * redirection coûte une requête et évite un 404 inexplicable.
 *
 * Le catch-all est optionnel, donc `/client/services/konnect/47` tout court est
 * couvert autant que `/client/services/konnect/47/parametrage`.
 *
 * PAS DE CONTRÔLE D'ACCÈS ICI au-delà de la session, et c'est délibéré : on ne
 * fait que traduire une adresse en une autre. C'est la destination qui décide
 * qui a le droit d'y entrer, par `assertUserAccess` sur la route de résolution.
 * Doubler ce contrôle ici n'ajouterait rien, sinon un second endroit à tenir
 * d'accord avec le premier.
 */
export default async function RedirectionKonnect({
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

  redirect(cheminCentre(userId, "konnect", (params.reste ?? []).join("/")));
}

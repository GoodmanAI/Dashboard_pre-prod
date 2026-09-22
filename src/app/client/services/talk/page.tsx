import { redirect } from "next/navigation";

/**
 * Ancien accueil LyraeTalk, d'avant les adresses par centre (`/client/c/{id}/talk`).
 * Plus au menu depuis le multi-produit ; il restait la cible de repli de la connexion
 * quand aucune page n'est accessible. L'accueil client sait quoi montrer dans ce cas.
 * Retiré le 22/09/2026, avec sa copie `page[prod].tsx` qui n'était pas servie.
 */
export default function AncienAccueilTalk() {
  redirect("/client");
}

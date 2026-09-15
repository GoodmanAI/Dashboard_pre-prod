import { redirect } from "next/navigation";

/**
 * L'ancien formulaire de création d'un client vivait ici (813 lignes, jusqu'au
 * 15/09/2026). La création part désormais d'un seul endroit, l'assistant
 * `/admin/nouveau-centre`, qui appelle la même route `POST /api/admin/create-client`
 * puis enchaîne la mise en service. Cette page ne fait plus que renvoyer, pour que les
 * favoris et les liens anciens continuent d'arriver quelque part.
 *
 * La case « Secrétaire » de l'ancien formulaire n'a pas d'équivalent ici, et c'est
 * voulu : un compte secrétaire est un compte rattaché à un centre, il se crée depuis
 * « Clients et comptes » avec le préréglage de la grille de droits.
 */
export default function Page() {
  redirect("/admin/nouveau-centre");
}

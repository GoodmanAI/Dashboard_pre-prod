/**
 * L'adoption de Desk, par un adaptateur (C-04).
 *
 * L'adoption est la part des RDV pris dans Desk plutôt que dans Xplore, pour un
 * centre. Aucune source ne la porte aujourd'hui : Desk n'est pas encore en
 * service. À brancher le jour où Desk compte ses RDV, en une requête groupée par
 * accès produit (`UserProduct`), en pourcentage entier. Seul ce fichier changera.
 *
 * `null` veut dire « rien de disponible » : l'écran le dit, sans inventer de
 * chiffre.
 */
export async function adoptionDesk(userProductIds: number[]): Promise<Map<number, number> | null> {
  void userProductIds;
  return null;
}

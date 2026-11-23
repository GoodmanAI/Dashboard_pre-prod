/**
 * Les tickets ouverts de chaque compte client, par un adaptateur (C-02, C-04).
 *
 * À brancher au Dashboard : le nombre de tickets ouverts par compte client
 * (`User` de rôle CLIENT), en lecture seule, en une requête groupée. Le schéma
 * des tickets du Dashboard n'est pas connu ici (seule `TicketMessage` est citée
 * par C-01) : aucun miroir n'est créé avec des noms devinés. Le jour du
 * branchement, seul ce fichier change ; aucun autre fichier de Pilot ne connaît
 * la source.
 *
 * `null` veut dire « non branché » : l'écran le dit, il n'invente pas un zéro.
 */
export async function ticketsOuverts(userIds: number[]): Promise<Map<number, number> | null> {
  void userIds;
  return null;
}

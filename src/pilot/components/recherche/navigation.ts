import type { ResultatsRecherche } from "@/pilot/lib/recherche";

/** Les trois groupes de résultats, dans l'ordre où ils s'affichent. */
export const GROUPES = { organisations: "Clients", contacts: "Contacts", centres: "Centres" } as const;
export type GroupeResultat = keyof typeof GROUPES;
export type GroupeOption = GroupeResultat | "creation";

/** Une ligne de la liste déroulante, résultat ou entrée de création. */
export type OptionRecherche = { cle: string; groupe: GroupeOption; libelle: string; secondaire: string; lien: string };

/** Même règle que le service : espaces réduits, de deux à quatre-vingts caractères (C-36). */
export function requetePropre(q: string): { propre: string; valide: boolean } {
  const propre = q.trim().replace(/\s+/g, " ");
  return { propre, valide: propre.length >= 2 && propre.length <= 80 };
}

/** Un identifiant, jamais le texte cherché : la fiche d'un résultat ne porte rien de saisi dans son adresse. */
export const lienResultat = (groupe: GroupeResultat, organisationId: number) =>
  "/pilot/organisations/" + organisationId + (groupe === "organisations" ? "" : "?onglet=" + groupe);

/** Ici le texte est un nom d'organisation choisi pour être créé : il peut passer par l'adresse (C-36). */
export const lienCreation = (propre: string) => "/pilot/organisations/nouveau?nom=" + encodeURIComponent(propre);

/**
 * Les lignes dans l'ordre d'affichage, à plat : c'est l'ordre des flèches. S'il n'y a aucun
 * résultat et que la création est possible, la liste ne contient que « Créer le prospect ».
 */
export function listerOptions(resultats: ResultatsRecherche, propre: string, creerPossible: boolean): OptionRecherche[] {
  const lignes = (Object.keys(GROUPES) as GroupeResultat[]).flatMap((groupe) =>
    resultats[groupe].map((r): OptionRecherche => ({ cle: groupe + "-" + r.id, groupe, libelle: r.libelle, secondaire: r.secondaire,
      lien: lienResultat(groupe, r.organisationId) })));
  if (lignes.length === 0 && creerPossible && propre) {
    return [{ cle: "creation", groupe: "creation", libelle: "Créer le prospect « " + propre + " »", secondaire: "", lien: lienCreation(propre) }];
  }
  return lignes;
}

/** Ligne suivante (sens 1) ou précédente (sens -1), avec bouclage aux deux bouts. Sans ligne : 0. */
export function deplacer(actif: number, total: number, sens: 1 | -1): number {
  if (total <= 0) return 0;
  const depart = Math.min(Math.max(actif, 0), total - 1);
  return (depart + sens + total) % total;
}

import { debutDuJour } from "@/pilot/lib/dates";

/**
 * Les règles des grilles tarifaires (lot S), en fonctions pures : aucune lecture
 * de la base ni de l'horloge, l'instant entre en paramètre. Tout ce qui se
 * calcule ici (statut, grille utilisée) l'est à la lecture, jamais stocké (C-08).
 */

export type StatutGrille = "EN_VIGUEUR" | "PASSEE" | "PROCHAINE";

export const MESSAGE_DOUBLON_DATE = "Une grille s'applique déjà à cette date. Choisissez un autre jour, ou modifiez cette grille.";
export const MESSAGE_DOUBLON_CODE = "Cette grille a déjà un tarif avec ce code. Modifiez-le plutôt que d'en ajouter un second.";
export const MESSAGE_GRILLE_VIDE_AUJOURDHUI = "Une grille sans tarif ne peut pas s'appliquer aujourd'hui : les propositions n'auraient plus de prix. Reprenez les tarifs d'une grille, ou choisissez un jour à venir.";
export const MESSAGE_SUPPRESSION_GRILLE = "Seule une grille à venir se supprime. Celle-ci a déjà servi de référence : créez plutôt une nouvelle grille datée.";
export const ORDRE_MAXIMUM = 10000;

/**
 * Le statut de chaque grille à l'instant donné, du plus lointain au plus ancien.
 * En vigueur : la grille dont le jour d'application est le plus récent sans
 * dépasser l'instant, comme `lireGrilleEnVigueur`. Sans grille de ce jour ou
 * d'avant, aucune n'est en vigueur : une grille à venir n'est jamais promue.
 */
export function classerGrilles<T extends { id: number; applicableLe: Date }>(grilles: readonly T[], maintenant: Date): Array<T & { statut: StatutGrille }> {
  const triees = [...grilles].sort((a, b) => +b.applicableLe - +a.applicableLe || b.id - a.id);
  const enVigueur = triees.find((g) => +g.applicableLe <= +maintenant);
  return triees.map((g) => ({ ...g, statut: g === enVigueur ? "EN_VIGUEUR" : +g.applicableLe > +maintenant ? "PROCHAINE" : "PASSEE" }));
}

/**
 * Une grille ne se date ni dans le passé ni de la veille : une date passée
 * changerait après coup la grille qu'une lecture à cette date aurait vue, et
 * celle que l'écran dit « en vigueur ». Aujourd'hui (UTC, comme les jours
 * d'application) s'applique tout de suite.
 */
export const MESSAGE_DATE_PASSEE = "Une grille s'applique à partir d'aujourd'hui ou plus tard. Choisissez une date à venir.";
export function messageDateGrille(applicableLe: Date, maintenant: Date): string | null {
  return +applicableLe < +debutDuJour(maintenant) ? MESSAGE_DATE_PASSEE : null;
}

/**
 * Une grille vide ne prend pas effet le jour même : elle deviendrait aussitôt la
 * grille en vigueur, et plus aucune proposition ne se préremplirait. Plus tard,
 * on a le temps d'y ajouter les tarifs avant qu'elle s'applique.
 */
export function messageGrilleVide(applicableLe: Date, nombreTarifs: number, maintenant: Date): string | null {
  return nombreTarifs === 0 && +applicableLe <= +debutDuJour(maintenant) ? MESSAGE_GRILLE_VIDE_AUJOURDHUI : null;
}

/**
 * Une grille en vigueur ne se vide pas : retirer son dernier tarif mettrait à
 * zéro, tout de suite, l'estimation des prospects, le préremplissage et les
 * commissions, comme une grille vide datée d'aujourd'hui. Une grille à venir
 * peut se vider : l'écran dit qu'elle s'appliquerait sans aucun prix.
 */
export const MESSAGE_DERNIER_TARIF = "C'est le dernier tarif d'une grille qui s'applique déjà : sans lui, les propositions n'auraient plus de prix. Ajoutez d'abord un autre tarif, ou créez une nouvelle grille datée.";
export function messageRetraitTarif(applicableLe: Date, tarifsAvantRetrait: number, maintenant: Date): string | null {
  return tarifsAvantRetrait <= 1 && +applicableLe <= +maintenant ? MESSAGE_DERNIER_TARIF : null;
}

/** Pourquoi une grille ne se modifie plus, ou null. Une grille se fige dès qu'une proposition s'en sert. */
export function messageGrilleUtilisee(nombrePropositions: number): string | null {
  if (!Number.isInteger(nombrePropositions) || nombrePropositions < 0) throw new Error("Nombre de propositions invalide.");
  if (nombrePropositions === 0) return null;
  const propositions = nombrePropositions === 1 ? "1 proposition" : `${nombrePropositions} propositions`;
  return `Cette grille sert déjà à ${propositions}. Créez une nouvelle grille datée pour changer un prix.`;
}

/**
 * Pourquoi une grille ne se supprime pas, ou null. Seule une grille à venir que
 * rien n'utilise se supprime : une grille en vigueur ou passée a servi de
 * référence, une grille utilisée est retenue par ses propositions.
 */
export function messageSuppressionGrille(statut: StatutGrille, nombrePropositions: number): string | null {
  return messageGrilleUtilisee(nombrePropositions) ?? (statut === "PROCHAINE" ? null : MESSAGE_SUPPRESSION_GRILLE);
}

/** Seule une grille à venir change de date : celle en vigueur ou passée a déjà servi de référence. */
export function peutChangerLaDate(statut: StatutGrille): boolean {
  return statut === "PROCHAINE";
}

/** L'ordre d'un tarif ajouté : à la suite des autres, de dix en dix pour laisser la place d'en glisser un. */
export function ordreSuivant(ordres: readonly number[]): number {
  return Math.min(ORDRE_MAXIMUM, ordres.reduce((m, o) => Math.max(m, o), 0) + 10);
}

/** Ce que l'écran lit d'une grille, calculé à la lecture. */
export function resumerGrille(statut: StatutGrille, nombrePropositions: number) {
  const raison = messageGrilleUtilisee(nombrePropositions);
  return {
    statut, nombrePropositions, modifiable: raison === null, raison,
    dateModifiable: raison === null && peutChangerLaDate(statut),
    supprimable: messageSuppressionGrille(statut, nombrePropositions) === null,
  };
}

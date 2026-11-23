import type { CrmBaseTarif, CrmTypeLigne } from "@prisma/client";
import { entierDepuisSaisie, eurosPrecis } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
import type { StatutGrille } from "./regles";

/**
 * Ce que la page Tarifs écrit (lot S), en fonctions pures : la base d'un tarif
 * en clair, son prix ou ce qui manque, les phrases d'une grille, ce qu'on peut
 * en faire. Aucun calcul d'argent ici : les montants viennent de la grille, en
 * centimes entiers, et les taux sont des pour-mille entiers.
 */

export const PRIX_A_RENSEIGNER = "Prix à renseigner";
export const INVITATION_PRIX = "Renseignez ce prix pour qu'il entre dans les propositions préremplies.";

/** « 15 % », « 12,5 % » : un pour-mille entier, écrit sans flottant. */
export function formaterPourcentage(pourMille: number): string {
  const reste = pourMille % 10;
  return `${Math.trunc(pourMille / 10)}${reste ? "," + reste : ""} %`;
}

/** Un taux comme on le saisit, sans le signe : « 15 » ou « 12,5 ». Le contraire exact de `tauxDepuisSaisie`. */
export function saisieTaux(pourMille: number): string {
  const reste = pourMille % 10;
  return `${Math.trunc(pourMille / 10)}${reste ? "," + reste : ""}`;
}

/** Le taux saisi en pour-mille entier, de 0 à 100 %, une décimale au plus. */
export function tauxDepuisSaisie(saisie: string): number {
  const valeur = entierDepuisSaisie(saisie, 1, "Taux en pourcentage");
  if (valeur > 1000) throw new Error("Vérifiez le champ « Taux en pourcentage ».");
  return valeur;
}

type BaseTarifLue = { type: CrmTypeLigne; base: CrmBaseTarif; pourMille: number | null };

/**
 * La base d'un tarif en clair : « par salle et par mois », « par site, une
 * fois », « 15 % du montant des salles ». Un abonnement se facture chaque mois,
 * une installation ou une prestation une seule fois.
 */
export function libelleBase({ type, base, pourMille }: BaseTarifLue): string {
  if (base === "POURCENTAGE") return pourMille == null ? "Pourcentage du montant des salles" : `${formaterPourcentage(pourMille)} du montant des salles`;
  const sujet = base === "PAR_SALLE" ? "par salle" : base === "PAR_SITE" ? "par site" : "par organisation";
  return type === "ABONNEMENT" ? `${sujet} et par mois` : `${sujet}, une fois`;
}

/** Le prix d'un tarif, hors taxe, au centime. Vide : « Prix à renseigner », jamais 0 €. */
export function montantTarif({ base, montantHtCentimes }: { base: CrmBaseTarif; montantHtCentimes: number | null }): string {
  if (base === "POURCENTAGE") return "Selon les salles";
  return montantHtCentimes == null ? PRIX_A_RENSEIGNER : eurosPrecis(montantHtCentimes);
}

/** Les bases qu'on propose à la saisie d'un tarif. */
export const LIBELLES_BASE_CHOIX: Record<CrmBaseTarif, string> = {
  PAR_SALLE: "Par salle", PAR_SITE: "Par site", PAR_ORGANISATION: "Par organisation", POURCENTAGE: "Pourcentage du montant des salles",
};

/** Les tarifs dont le prix n'est pas renseigné. Un pourcentage n'a pas de prix à renseigner. */
export function tarifsARenseigner<T extends { base: CrmBaseTarif; montantHtCentimes: number | null }>(tarifs: readonly T[]): T[] {
  return tarifs.filter((t) => t.base !== "POURCENTAGE" && t.montantHtCentimes == null);
}

/** « 18/11/2026 » depuis « 2026-11-18 ». */
export const jourFr = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;

export const titreGrille = (applicableLe: string) => `Grille du ${jourFr(applicableLe)}`;

export function phraseGrille(statut: StatutGrille, applicableLe: string): string {
  const jour = jourFr(applicableLe);
  return statut === "EN_VIGUEUR" ? `En vigueur depuis le ${jour}`
    : statut === "PROCHAINE" ? `Prochaine grille, applicable à partir du ${jour}`
    : `Ancienne grille, appliquée à partir du ${jour}`;
}

/**
 * Une grille sans tarif, en clair. À venir, elle s'appliquerait sans aucun prix :
 * l'écran le dit avant qu'elle entre en vigueur. Puis comment la remplir, si on le peut.
 */
export function phraseGrilleSansTarif(statut: StatutGrille, applicableLe: string, peutAjouter: boolean): string {
  const quand = statut === "PROCHAINE" ? ` Elle s'appliquera le ${jourFr(applicableLe)} sans aucun prix.` : "";
  return `Cette grille n'a aucun tarif.${quand}${peutAjouter ? " Ajoutez-en avec « Ajouter un tarif »." : ""}`;
}

/** La confirmation de la suppression d'une grille, accordée au nombre de ses tarifs. */
export function phraseSuppressionGrille(applicableLe: string, nombreTarifs: number): string {
  const grille = `La grille du ${jourFr(applicableLe)}`;
  if (nombreTarifs === 0) return `${grille} sera supprimée.`;
  return `${grille} et ${nombreTarifs === 1 ? "son tarif" : `ses ${compter(nombreTarifs, "tarif")}`} seront supprimés.`;
}

export type DroitsGrille = { modifier: boolean; copier: boolean; phrase: string | null };

export const PHRASE_LECTURE_SEULE = "Lecture seule : votre compte n'a pas le droit « Modifier les montants ».";
export const PHRASE_ANCIENNE_GRILLE = "Cette grille n'est plus en vigueur : elle ne se modifie pas. Créez une nouvelle grille datée pour changer un prix.";

/**
 * Sous un « Prix à renseigner » : comment le remplir, ou pourquoi on ne le peut pas ici.
 * Une case vide dit toujours quoi faire (CLAUDE.md).
 */
export function aideTarifARenseigner(droits: Pick<DroitsGrille, "modifier" | "copier">): string {
  if (droits.modifier) return INVITATION_PRIX;
  if (droits.copier) return "Cette grille ne se modifie plus. Créez une nouvelle grille datée pour renseigner ce prix.";
  return "Demandez à un compte qui peut modifier les montants de renseigner ce prix.";
}

/**
 * Ce qu'on peut faire d'une grille. Sans le droit « Modifier les montants » :
 * rien, et une phrase le dit. Une grille que des propositions utilisent ne se
 * modifie plus (la raison vient du serveur) ; une ancienne grille non plus. On
 * peut toujours en créer une nouvelle datée, copiée de celle-ci. La garde reste
 * côté serveur : l'écran n'est jamais la seule barrière.
 */
export function droitsGrille(grille: { statut: StatutGrille; modifiable: boolean; raison: string | null }, peutModifierLesMontants: boolean): DroitsGrille {
  if (!peutModifierLesMontants) return { modifier: false, copier: false, phrase: PHRASE_LECTURE_SEULE };
  if (!grille.modifiable) return { modifier: false, copier: true, phrase: grille.raison };
  if (grille.statut === "PASSEE") return { modifier: false, copier: true, phrase: PHRASE_ANCIENNE_GRILLE };
  return { modifier: true, copier: true, phrase: null };
}

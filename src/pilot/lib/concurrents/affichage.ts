import type { CrmEtapeCommerciale } from "@prisma/client";
import { eurosPrecis } from "@/pilot/lib/argent";
import { ilYA } from "@/pilot/lib/prospection/regles";

/**
 * La mise en mots des prix et des relevés d'un concurrent (lot R). Un prix
 * absent se dit « Prix non relevé », jamais 0 €. À côté d'un autre prix, il dit
 * duquel il parle (« Installation : prix non relevé »). Règles pures : les écrans
 * de la liste, de la fiche et du sélecteur disent la même chose.
 */

export const PRIX_NON_RELEVE = "Prix non relevé";

/**
 * « 12,00 € par salle et par mois », ou, quand le relevé n'en donne pas,
 * « Par salle et par mois : prix non relevé » : il s'affiche toujours à côté
 * du prix d'installation, la phrase dit donc de quel prix elle parle.
 */
export function prixSalleAffiche(centimes: number | null | undefined): string {
  return centimes == null ? `Par salle et par mois : ${PRIX_NON_RELEVE.toLowerCase()}` : `${eurosPrecis(centimes)} par salle et par mois`;
}

/** « 500,00 € d'installation », ou « Installation : prix non relevé ». */
export function prixInstallationAffiche(centimes: number | null | undefined): string {
  return centimes == null ? `Installation : ${PRIX_NON_RELEVE.toLowerCase()}` : `${eurosPrecis(centimes)} d'installation`;
}

/** « Relevé il y a 3 mois », « Relevé aujourd'hui ». */
export function ancienneteReleve(releveLe: Date | string, maintenant: Date): string {
  return `Relevé ${ilYA(new Date(releveLe), maintenant)}`;
}

/** Un relevé de plus d'un an se dit ancien : l'écran l'annonce à côté de son âge. */
export const RELEVE_ANCIEN_JOURS = 365;
export function releveAncien(releveLe: Date | string, maintenant: Date): boolean {
  return (maintenant.getTime() - new Date(releveLe).getTime()) / 86400000 > RELEVE_ANCIEN_JOURS;
}

/** Le résumé d'un prix pour la liste : le prix repère par salle et son âge, ou ce qui manque. */
export function resumePrix(releve: { prixSalleMoisCentimes: number | null; releveLe: Date | string } | null, maintenant: Date): { prix: string; anciennete: string | null } {
  if (!releve) return { prix: PRIX_NON_RELEVE, anciennete: null };
  return {
    prix: releve.prixSalleMoisCentimes == null ? PRIX_NON_RELEVE : `${eurosPrecis(releve.prixSalleMoisCentimes)} par salle`,
    anciennete: ancienneteReleve(releve.releveLe, maintenant),
  };
}

export type CentreEquipe = { id: number; raisonSocialeNom: string; etape: CrmEtapeCommerciale; lien: "en_place" | "passe_chez_lyrae" };

/**
 * Les établissements qui désignent ce concurrent comme solution en place, en deux
 * groupes : ceux qui l'ont encore, et ceux qui sont passés chez Lyrae depuis. Le
 * lien est celui de `lienAvecConcurrent` (`effectif.ts`), calculé par le serveur :
 * aucune règle à part ici. L'ordre reçu est gardé dans chaque groupe.
 */
export function repartirEtablissements<T extends { lien: CentreEquipe["lien"] }>(centres: readonly T[]): { enPlace: T[]; passesChezLyrae: T[] } {
  return { enPlace: centres.filter((c) => c.lien === "en_place"), passesChezLyrae: centres.filter((c) => c.lien === "passe_chez_lyrae") };
}

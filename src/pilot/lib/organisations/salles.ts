import { compter } from "@/pilot/lib/texte";

/**
 * Les salles d'un dossier : une seule fonction, un seul ordre, que lisent le
 * barème de température (`temperature.ts`) et le préremplissage d'une
 * proposition (`tarifs/preremplir.ts`, appelé par `propositions/lignesPreremplies.ts`).
 *
 * L'ordre, de la source la plus précise à la plus grossière :
 * 1. les salles saisies une par une dans les centres (`CrmSalle`), dès qu'un
 *    centre en a une : elles sont comptées, pas estimées ;
 * 2. sinon le nombre de salles de la fiche (`nombreSalles`), s'il est positif,
 *    réparti en entiers sur les centres pour le préremplissage
 *    (`repartirSalles`, le reste sur le premier) ;
 * 3. sinon la somme des équipements déclarés sur la fiche (IRM, scanners, radio,
 *    écho, mammo). Un équipement n'est pas une salle facturable : le barème s'en
 *    sert pour la taille, le préremplissage ne facture rien dessus (chaque centre
 *    reste sans salle, et sa remarque le dit) ;
 * 4. sinon inconnu.
 * On ne mêle jamais deux sources : ce serait compter deux fois les mêmes salles.
 * Un 0 ou un vide veut dire « pas renseigné » : il ne masque jamais la source
 * suivante. Une valeur négative compte pour 0.
 */

/** Les champs d'équipement de la fiche, additionnés pour la troisième source. */
export const CHAMPS_EQUIPEMENTS = ["nombreIrm", "nombreScanners", "nombreRadio", "nombreEcho", "nombreMammo"] as const;

export type FicheSalles = { nombreSalles?: number | null } & Partial<Record<(typeof CHAMPS_EQUIPEMENTS)[number], number | null>>;
export type SourceSalles = "CENTRES" | "FICHE" | "EQUIPEMENTS" | "INCONNUE";
export type SallesDossier = {
  /** Le nombre retenu, 0 si inconnu. */
  total: number;
  source: SourceSalles;
  /**
   * Les salles de chaque centre, dans l'ordre reçu, pour le préremplissage : les
   * saisies (source CENTRES), la répartition du nombre de la fiche (FICHE), sinon
   * des zéros (EQUIPEMENTS, INCONNUE : rien à facturer).
   */
  parCentre: number[];
  /** Le nombre de la fiche a été réparti sur les centres : le préremplissage le signale. */
  reparties: boolean;
};

/**
 * Les salles de chaque centre. Les salles saisies si un centre au moins en a ;
 * sinon `nombreSalles` réparti en entiers, le reste sur le premier centre
 * (7 salles sur 3 centres : 3, 2, 2 ; 2 sur 3 : 2, 0, 0).
 */
export function repartirSalles(saisies: readonly number[], nombreSalles: number | null | undefined): { salles: number[]; reparties: boolean } {
  if (saisies.some((n) => n > 0) || !saisies.length || nombreSalles == null || !Number.isSafeInteger(nombreSalles) || nombreSalles <= 0) {
    return { salles: [...saisies], reparties: false };
  }
  const part = Math.floor(nombreSalles / saisies.length), reste = nombreSalles - part * saisies.length;
  return { salles: saisies.map((_, i) => part + (i === 0 ? reste : 0)), reparties: true };
}

export function sallesDuDossier(org: FicheSalles, centres: readonly { salles: number }[]): SallesDossier {
  const saisies = centres.map((c) => Math.max(0, c.salles));
  const enCentres = saisies.reduce((t, n) => t + n, 0);
  if (enCentres > 0) return { total: enCentres, source: "CENTRES", parCentre: saisies, reparties: false };
  const fiche = org.nombreSalles;
  if (fiche != null && fiche > 0) {
    const { salles, reparties } = repartirSalles(saisies, fiche);
    return { total: fiche, source: "FICHE", parCentre: salles, reparties };
  }
  const equipements = CHAMPS_EQUIPEMENTS.reduce((t, champ) => t + Math.max(0, org[champ] ?? 0), 0);
  if (equipements > 0) return { total: equipements, source: "EQUIPEMENTS", parCentre: saisies, reparties: false };
  return { total: 0, source: "INCONNUE", parCentre: saisies, reparties: false };
}

/** Ce que l'écran dit avoir lu : « 2 salles saisies dans les centres », « 8 salles déclarées sur la fiche », « 6 équipements déclarés ». */
export function valeurSalles({ total, source }: Pick<SallesDossier, "total" | "source">): string {
  const pluriel = total > 1;
  switch (source) {
    case "CENTRES": return `${compter(total, "salle")} ${pluriel ? "saisies" : "saisie"} dans les centres`;
    case "FICHE": return `${compter(total, "salle")} ${pluriel ? "déclarées" : "déclarée"} sur la fiche`;
    case "EQUIPEMENTS": return `${compter(total, "équipement")} ${pluriel ? "déclarés" : "déclaré"}`;
    case "INCONNUE": return "Nombre de salles inconnu";
  }
}

import { compter } from "@/pilot/lib/texte";

/**
 * Le nombre de sites d'un dossier (C-92) : une seule règle, que lisent la carte
 * du tableau Prospects, la liste À prospecter, la liste des clients et la fiche.
 *
 * Le nombre saisi sur la fiche (`nombreSites`) dit la taille de l'établissement,
 * y compris les sites que Pilot ne suit pas encore. Un centre créé dans Pilot est
 * un site : le compte ne descend jamais sous le nombre de centres. Sans nombre
 * saisi, ce sont les centres ; sans l'un ni l'autre, inconnu (null).
 */
export function nombreDeSites(saisi: number | null | undefined, centres: number): number | null {
  if (saisi == null || saisi <= 0) return centres > 0 ? centres : null;
  return Math.max(saisi, centres);
}

/** Le refus quand on saisit moins de sites que de centres déjà créés. */
export function sitesSousLesCentres(centres: number): string {
  return `Ce client a déjà ${compter(centres, "centre")} dans Pilot. Indiquez au moins ${compter(centres, "site")}.`;
}

/** « 3 sites », ou « Sites non renseignés ». */
export function libelleSites(sites: number | null): string {
  return sites === null ? "Sites non renseignés" : compter(sites, "site");
}

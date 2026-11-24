import type { CrmBaseTarif, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { centimesDepuisSaisie, saisieEuros } from "@/pilot/lib/argent";
import { pourMilleDepuisSaisie } from "./regles";

/** Une remise en pour-mille, écrite comme on la saisit : 125 donne « 12,5 ». */
export const saisiePourMille = (n: number) => Math.trunc(n / 10) + (n % 10 ? "," + n % 10 : "");

/**
 * Une ligne de proposition telle que le dialogue la saisit (lot S), et sa
 * traduction vers ce que le serveur reçoit. Pure, arithmétique entière : le
 * montant passe par `centimesDepuisSaisie`, jamais par un flottant.
 */
export type LigneSaisie = {
  /** « » : ligne hors catalogue (prestation, connecteur RIS…). Le libellé est alors obligatoire. */
  productId: number | "";
  centreId: number | "";
  type: CrmTypeLigne;
  montant: string;
  unite: CrmUniteVariable;
  volume: string;
  libelle: string;
  /** Geste commercial : le brut reste affiché, le net est 0. */
  offerte: boolean;
  /**
   * Le calcul (C-90) : quantité et prix unitaire, tous deux saisis ou tous
   * deux vides. Saisis, ils font le montant, qui n'est plus tapé à la main.
   */
  quantite: string; prixUnitaire: string; base: CrmBaseTarif | "";
  /** La remise de la ligne en pourcentage ; vide, la ligne suit celle de la version. */
  remise: string;
};

/** Une quantité : un entier de 1 à 100 000, sans décimale. */
export function quantiteDepuisSaisie(saisie: string): number {
  const valeur = saisie.trim();
  if (!/^\d{1,6}$/.test(valeur) || Number(valeur) < 1 || Number(valeur) > 100000) throw new Error("Vérifiez le champ « Quantité » : un nombre entier, 1 au moins.");
  return Number(valeur);
}

/** La ligne donne-t-elle son calcul ? Une quantité saisie suffit à le dire : le prix est alors exigé. */
export const ligneCalculee = (l: Pick<LigneSaisie, "quantite" | "prixUnitaire">) => l.quantite.trim() !== "" || l.prixUnitaire.trim() !== "";

/** Le montant d'une ligne calculée, saisie en cours comprise ; lève si la quantité ou le prix ne se lisent pas. */
export function montantCalcule(l: Pick<LigneSaisie, "quantite" | "prixUnitaire">): number {
  const brut = quantiteDepuisSaisie(l.quantite) * centimesDepuisSaisie(l.prixUnitaire);
  if (!Number.isSafeInteger(brut)) throw new Error("Montant trop élevé.");
  return brut;
}

export type LigneEnvoyee = {
  productId: number | null; centreId: number | null; type: CrmTypeLigne; montantCentimes: number;
  unite: CrmUniteVariable | null; volumeInclus: number | null; libelle: string | null; offerte: boolean;
  quantite: number | null; prixUnitaireCentimes: number | null; baseQuantite: CrmBaseTarif | null; remisePourMille: number | null;
};

type LigneLue = {
  productId: number | null; centreId: number | null; type: CrmTypeLigne; montantCentimes: number;
  unite: CrmUniteVariable | null; volumeInclus: number | null; libelle: string | null; offerte?: boolean | null;
  quantite?: number | null; prixUnitaireCentimes?: number | null; baseQuantite?: CrmBaseTarif | null; remisePourMille?: number | null;
};

export function saisieDepuisLigne(l: LigneLue): LigneSaisie {
  return {
    productId: l.productId ?? "", centreId: l.centreId ?? "", type: l.type, montant: saisieEuros(l.montantCentimes),
    unite: l.unite ?? "APPEL_TRAITE", volume: l.volumeInclus == null ? "" : String(l.volumeInclus), libelle: l.libelle ?? "", offerte: !!l.offerte,
    quantite: l.quantite == null ? "" : String(l.quantite), prixUnitaire: l.prixUnitaireCentimes == null ? "" : saisieEuros(l.prixUnitaireCentimes),
    base: l.quantite == null ? "" : l.baseQuantite ?? "", remise: l.remisePourMille == null ? "" : saisiePourMille(l.remisePourMille),
  };
}

/** Lève si le montant n'est pas un montant en euros valide : l'écran dit alors de compléter la saisie. */
export function ligneDepuisSaisie(l: LigneSaisie): LigneEnvoyee {
  const variable = l.type === "PART_VARIABLE";
  // Une part variable a déjà un prix unitaire : la quantité ne s'y applique pas (C-90).
  const calculee = !variable && ligneCalculee(l);
  return {
    productId: l.productId === "" ? null : l.productId, centreId: l.centreId === "" ? null : l.centreId, type: l.type,
    montantCentimes: calculee ? montantCalcule(l) : centimesDepuisSaisie(l.montant),
    unite: variable ? l.unite : null, volumeInclus: variable && l.volume !== "" ? Number(l.volume) : null,
    libelle: l.libelle.trim() || null, offerte: l.offerte,
    quantite: calculee ? quantiteDepuisSaisie(l.quantite) : null,
    prixUnitaireCentimes: calculee ? centimesDepuisSaisie(l.prixUnitaire) : null,
    baseQuantite: calculee && l.base !== "" ? l.base : null,
    remisePourMille: l.remise.trim() === "" ? null : pourMilleDepuisSaisie(l.remise),
  };
}

/** Une ligne du catalogue, à compléter. */
export const ligneCatalogue = (productId: number | ""): LigneSaisie =>
  ({ productId, centreId: "", type: "ABONNEMENT", montant: "", unite: "APPEL_TRAITE", volume: "", libelle: "", offerte: false, quantite: "", prixUnitaire: "", base: "", remise: "" });

/** Une ligne hors grille : sans produit, une prestation facturée une fois, au libellé à donner. */
export const ligneHorsGrille = (): LigneSaisie =>
  ({ productId: "", centreId: "", type: "PRESTATION", montant: "", unite: "APPEL_TRAITE", volume: "", libelle: "", offerte: false, quantite: "", prixUnitaire: "", base: "", remise: "" });

/**
 * Ce que le dialogue dit d'une ligne qui ne peut pas partir, ou null. Même règle
 * que le serveur : sans produit, un libellé. Une ligne offerte peut valoir 0 :
 * un geste sans valeur affichée (« Formation incluse »), voir `conseilLigne`.
 */
export function refusLigne(l: LigneSaisie): string | null {
  if (l.productId === "" && !l.libelle.trim()) return "Donnez un libellé à une ligne hors catalogue.";
  return null;
}

export const CONSEIL_OFFERTE_SANS_PRIX = "Offert sans prix affiché. Si vous le connaissez, indiquez son prix pour montrer ce que vous offrez.";

/** Une invitation, jamais un refus : une ligne offerte à 0 part, mais son prix, s'il est connu, montre la valeur du geste. */
export function conseilLigne(l: LigneSaisie): string | null {
  if (!l.offerte) return null;
  try { return (ligneCalculee(l) && l.type !== "PART_VARIABLE" ? montantCalcule(l) : centimesDepuisSaisie(l.montant)) === 0 ? CONSEIL_OFFERTE_SANS_PRIX : null; }
  catch { return null; /* Montant pas encore saisi : le champ le dit déjà. */ }
}

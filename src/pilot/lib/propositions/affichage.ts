import type { CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { eurosPrecis } from "@/pilot/lib/argent";
import { LIBELLES_LIGNE, LIBELLES_UNITE, type TotalPart, type totauxProposition } from "./regles";

/**
 * Ce qu'une proposition ou un contrat écrit de ses gestes commerciaux et de son
 * récapitulatif (lot S), en fonctions pures. Aucun calcul d'argent ici : les
 * montants viennent de `totauxProposition` (regles.ts), qui additionne des
 * lignes arrondies une à une ; on les met en forme, au centime.
 */

export type LigneRecapitulatif = { libelle: string; montant: string; fort: boolean; secondaire: boolean };
export type SectionRecapitulatif = { cle: "mensuel" | "uneFois"; titre: string; suite: string; lignes: LigneRecapitulatif[] };

const SIGNE_MOINS = "-";

function lignesDeLaPart(part: TotalPart): LigneRecapitulatif[] {
  const l = (libelle: string, centimes: number, signe = "", fort = false): LigneRecapitulatif =>
    ({ libelle, montant: signe + eurosPrecis(centimes), fort, secondaire: false });
  return [
    l("Brut", part.brutCentimes),
    ...(part.remiseCentimes > 0 ? [l("Remise", part.remiseCentimes, SIGNE_MOINS)] : []),
    ...(part.gestesCentimes > 0 ? [l("Gestes commerciaux", part.gestesCentimes, SIGNE_MOINS)] : []),
    l("Net", part.netCentimes, "", true),
  ];
}

/**
 * Le récapitulatif d'une version : par famille, le brut, la remise, les gestes
 * et le net. L'abonnement se facture chaque mois ; l'installation et les
 * prestations une seule fois. Une famille sans montant n'apparaît pas. Quand les
 * deux sortes de frais uniques coexistent, le net dit ce qui vient de chacune.
 * La part à l'usage n'a pas de total : elle se lit par prix unitaire (`phraseUsage`).
 */
export function recapitulatif(totaux: Pick<ReturnType<typeof totauxProposition>, "parType" | "miseEnServiceCentimes" | "prestationCentimes">): SectionRecapitulatif[] {
  const sections: SectionRecapitulatif[] = [];
  const { mensuel, uneFois } = totaux.parType;
  if (mensuel.brutCentimes > 0) sections.push({ cle: "mensuel", titre: "Abonnement", suite: "par mois", lignes: lignesDeLaPart(mensuel) });
  if (uneFois.brutCentimes > 0) {
    const lignes = lignesDeLaPart(uneFois);
    if (totaux.miseEnServiceCentimes > 0 && totaux.prestationCentimes > 0) {
      lignes.push({ libelle: "dont frais d'installation", montant: eurosPrecis(totaux.miseEnServiceCentimes), fort: false, secondaire: true },
        { libelle: "dont prestations", montant: eurosPrecis(totaux.prestationCentimes), fort: false, secondaire: true });
    }
    sections.push({ cle: "uneFois", titre: "Installation et prestations", suite: "facturées une fois", lignes });
  }
  return sections;
}

/** Une part à l'usage : « 0,35 € par appel traité au-delà de 200 », ou « Offert par appel traité ». */
export function phraseUsage(v: { unite: CrmUniteVariable; prixNetCentimes: number; volumeInclus: number | null; offerte: boolean }): string {
  return `${v.offerte ? "Offert" : eurosPrecis(v.prixNetCentimes)} par ${LIBELLES_UNITE[v.unite]}${v.volumeInclus != null ? " au-delà de " + v.volumeInclus.toLocaleString("fr-FR") : ""}`;
}

type LigneLibellee = { type: CrmTypeLigne; libelle?: string | null };
type LigneGeste = LigneLibellee & { offerte?: boolean | null };

/** Ce que le type d'une ligne veut dire pour la facture, sous le champ Type : une prestation se facture une fois. */
export function aideType(type: CrmTypeLigne): string {
  return type === "ABONNEMENT" ? "Facturé chaque mois."
    : type === "MISE_EN_SERVICE" ? "Facturés une fois."
    : type === "PRESTATION" ? "Facturée une fois."
    : "Facturée selon l'usage.";
}

/** Le libellé d'une ligne : le sien, sinon celui de son type. */
export function libelleLigne(l: LigneLibellee): string {
  return l.libelle?.trim() || LIBELLES_LIGNE[l.type];
}

const GESTE_PAR_TYPE: Record<CrmTypeLigne, { sans: string; offert: string }> = {
  MISE_EN_SERVICE: { sans: "Installation offerte", offert: "offerte" },
  ABONNEMENT: { sans: "Abonnement offert", offert: "offert" },
  PRESTATION: { sans: "Prestation offerte", offert: "offerte" },
  PART_VARIABLE: { sans: "Part à l'usage offerte", offert: "offerte" },
};

/**
 * Le geste d'une ligne offerte, en clair. Sans libellé : d'après le type
 * (« Installation offerte »). Avec un libellé : le libellé, auquel on ajoute
 * « offerte » s'il ne dit pas déjà le geste (« Talk, une salle offerte » et
 * « Formation incluse » restent tels quels).
 */
export function phraseGeste(l: LigneLibellee): string {
  const libelle = l.libelle?.trim();
  if (!libelle) return GESTE_PAR_TYPE[l.type].sans;
  return /offert|inclus/i.test(libelle) ? libelle : `${libelle} ${GESTE_PAR_TYPE[l.type].offert}`;
}

/** Les gestes d'une liste de lignes : seules les lignes offertes, chaque phrase une fois. */
export function resumeGestes(lignes: readonly LigneGeste[]): string[] {
  return [...new Set(lignes.filter((l) => l.offerte).map(phraseGeste))];
}

/**
 * La phrase d'une fiche ou d'une vente : « Gestes commerciaux : installation
 * offerte, Talk, une salle offerte. » Null s'il n'y en a aucun.
 */
export function resumeGestesVente(lignes: readonly LigneGeste[]): string | null {
  const gestes = [...new Set(lignes.filter((l) => l.offerte).map((l) => (l.libelle?.trim() ? phraseGeste(l) : phraseGeste(l).toLowerCase())))];
  return gestes.length ? `Gestes commerciaux : ${gestes.join(", ")}.` : null;
}

/**
 * Une ligne à 0 qui n'est pas offerte attend son prix : un tarif sans prix dans
 * la grille donne une ligne ainsi (le préremplissage n'invente jamais un prix).
 * Rien n'est stocké. Deux lignes à 0 sont des choix, pas des lignes à chiffrer :
 * une ligne offerte (un geste, même sans valeur affichée, « Formation incluse »)
 * et la part à l'usage (un prix unitaire à 0 avec un volume inclus).
 */
export function estAChiffrer(l: { montantCentimes: number; offerte?: boolean | null; type: CrmTypeLigne }): boolean {
  return l.montantCentimes === 0 && !l.offerte && l.type !== "PART_VARIABLE";
}

/**
 * Le refus d'une écriture qui laisserait des lignes à chiffrer (garde serveur) :
 * combien, et quoi faire. Une seule règle (`estAChiffrer`) et un seul message
 * pour l'envoi d'une version (`changerStatut`) et pour un contrat actif
 * (activation, ligne ajoutée ou modifiée : `contrats/gerer.ts`, `contrats/lignes.ts`).
 * Une ligne à 0 peut venir d'un tarif sans prix, d'un connecteur RIS impossible
 * à calculer ou d'une saisie : la phrase ne suppose pas laquelle. Sur un contrat,
 * une ligne offerte est à 0 (C-76) : la phrase ne parle donc pas de son prix.
 */
export function messageAChiffrer(nombre: number, pour: "proposition" | "contrat" = "proposition"): string {
  const debut = nombre === 1 ? "1 ligne est à 0 € sans être offerte. Chiffrez-la, ou cochez Offert" : `${nombre} lignes sont à 0 € sans être offertes. Chiffrez-les, ou cochez Offert`;
  if (pour === "contrat") return `${debut}.`;
  return `${debut} ; ${nombre === 1 ? "indiquez son prix" : "indiquez leur prix"} pour montrer ce que vous offrez.`;
}

/** L'avertissement d'un brouillon qui a des lignes à chiffrer, ou null. */
export function phraseAChiffrer(nombre: number): string | null {
  if (nombre <= 0) return null;
  return `${messageAChiffrer(nombre)} La version ne s'envoie pas avant.`;
}

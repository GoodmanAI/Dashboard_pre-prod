import type { GrilleEstimation, ProduitTarif } from "./grille";
import { recurrentDesSalles } from "@/pilot/lib/apports/calcul";

/**
 * Le montant mensuel estimé d'un prospect, à partir du nombre de salles et des
 * offres envisagées (CHOIX.md, C-70). Fonction pure, arithmétique entière.
 *
 * La règle est celle du calcul des apports, partagée (`recurrentDesSalles`) :
 * chaque salle coûte le prix de chaque offre cochée ; le connecteur RIS ajoute
 * son pourcentage au montant des salles, arrondi au centime une seule fois
 * (demi-centime vers le haut). Le connecteur suit les salles : seul, il ne fait
 * pas un montant.
 *
 * Arrondi du connecteur (C-76) : ici, une seule fois, sur le total des salles du
 * prospect. La proposition préremplie (`preremplir.ts`) l'arrondit une fois par
 * centre, sur les salles de chaque centre, puisqu'elle porte une ligne par
 * centre. Pour un dossier de N centres, les deux montants peuvent donc s'écarter
 * d'au plus un centime par centre (au plus N centimes). C'est accepté :
 * l'estimation est un ordre de grandeur, la proposition dit ce qui sera facturé.
 */
export type OffresChoisies = { talk: boolean; konnect: boolean; connecteurRis: boolean };
export type ElementManquant = ProduitTarif | "CONNECTEUR_RIS";

export type Estimation =
  | { complet: true; mensuelCentimes: number; detail: { sallesCentimes: number; connecteurCentimes: number } }
  /** La grille ne donne pas un prix nécessaire : aucun montant, jamais un prix inventé. */
  | { complet: false; manquants: ElementManquant[] };

export function estimerMontant(salles: number | null | undefined, offres: OffresChoisies, grille: GrilleEstimation): Estimation | null {
  if (salles == null || !Number.isSafeInteger(salles) || salles < 1) return null;
  const produits: ProduitTarif[] = [...(offres.talk ? ["TALK" as const] : []), ...(offres.konnect ? ["KONNECT" as const] : [])];
  // Rien à chiffrer tant qu'aucune offre de salle n'est cochée.
  if (!produits.length) return null;

  const manquants: ElementManquant[] = produits.filter((p) => !((grille.prix[p]?.montantHtCentimes ?? 0) > 0));
  if (offres.connecteurRis && !((grille.connecteurRisPdm ?? 0) > 0)) manquants.push("CONNECTEUR_RIS");
  if (manquants.length) return { complet: false, manquants };

  // La règle des apports, appelée telle quelle : une seule source pour le prix des salles et du connecteur.
  const { recurrent: sallesCentimes, connecteur: connecteurCentimes } = recurrentDesSalles(salles,
    { talk: offres.talk, konnect: offres.konnect, ris: offres.connecteurRis },
    { talkCentimes: grille.prix.TALK?.montantHtCentimes ?? 0, konnectCentimes: grille.prix.KONNECT?.montantHtCentimes ?? 0, connecteurRisPdm: grille.connecteurRisPdm ?? 0 });
  const mensuelCentimes = sallesCentimes + connecteurCentimes;
  if (!Number.isSafeInteger(mensuelCentimes)) return null;
  return { complet: true, mensuelCentimes, detail: { sallesCentimes, connecteurCentimes } };
}

/** Le produit auquel rattacher un montant : la première offre de salle cochée, Talk avant Konnect. Le connecteur RIS n'est pas un produit. */
export function premierProduitOffert(offres: readonly (ProduitTarif | "CONNECTEUR_RIS")[]): ProduitTarif | null {
  return offres.includes("TALK") ? "TALK" : offres.includes("KONNECT") ? "KONNECT" : null;
}

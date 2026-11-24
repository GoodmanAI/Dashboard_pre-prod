import type { CrmBaseTarif } from "@prisma/client";
import type { GrilleEnVigueur, TarifGrille } from "@/pilot/lib/tarifs/grille";
import { ROLES } from "@/pilot/lib/tarifs/roles";
import type { ModeInstallation } from "./referentiel";

/**
 * Les prix de l'apport d'affaires, tirés de la grille tarifaire commune (lot S).
 *
 * L'apport ne porte plus sa grille : `CrmParametresApport` garde ses anciennes
 * colonnes de prix en base, plus lues. La grille est en HT ; l'apport calcule
 * ses commissions en HT, comme avant, et montre aux apporteurs le TTC qu'ils
 * connaissent (TVA des réglages de l'apport). Fonction pure, arithmétique entière.
 */

export type InstallationApport = {
  /** Frais d'installation et de formation TTC, comme l'apporteur les voit : le HT de la grille ramené en TTC. */
  ttcCentimes: number;
  /** Une fois par site, une fois par groupe, ou par salle : la base du tarif dans la grille. */
  mode: ModeInstallation;
};

export type PrixApport = {
  /** Abonnement mensuel HT d'une salle. */
  talkHtCentimes: number;
  konnectHtCentimes: number;
  /** Connecteur RIS : part du montant des salles, en points de base (15 % = 1500). */
  connecteurRisPdm: number;
  installationTalk: InstallationApport;
  installationKonnect: InstallationApport;
};

/** Ce que la grille ne donne pas : compté pour zéro, et l'écran le dit. Jamais un prix inventé. */
export type PrixManquant = "TALK" | "KONNECT" | "CONNECTEUR_RIS" | "INSTALLATION_TALK" | "INSTALLATION_KONNECT";
export const LIBELLES_PRIX_MANQUANT: Record<PrixManquant, string> = {
  TALK: "l'abonnement Talk par salle",
  KONNECT: "l'abonnement Konnect par salle",
  CONNECTEUR_RIS: "le pourcentage du connecteur RIS",
  INSTALLATION_TALK: "l'installation Talk",
  INSTALLATION_KONNECT: "l'installation Konnect",
};

/** Le mode d'installation de l'apport selon la base du tarif d'installation. */
const MODE_PAR_BASE: Partial<Record<CrmBaseTarif, ModeInstallation>> = { PAR_SITE: "site", PAR_ORGANISATION: "groupe", PAR_SALLE: "salle" };
/** La base de la grille selon le mode d'installation : l'inverse, pour l'export. */
export const BASE_PAR_MODE: Record<ModeInstallation, CrmBaseTarif> = { site: "PAR_SITE", groupe: "PAR_ORGANISATION", salle: "PAR_SALLE" };

/**
 * Un HT ramené en TTC, au centime le plus proche, demi vers le haut. TVA en points de base (20 % = 2000).
 * Arithmétique entière exacte, même forme que `appliquerTaux` (calcul.ts) : aucun produit flottant ne
 * s'arrondit de travers au-delà de 2^53. Hors entiers (jamais le cas en base), l'ancien calcul reste la référence.
 */
export function ttcDepuisHt(htCentimes: number, tvaPdm: number): number {
  const taux = 10000 + tvaPdm;
  if (!Number.isSafeInteger(htCentimes) || !Number.isSafeInteger(taux)) return Math.round((htCentimes * taux) / 10000);
  // round(x) = floor(x + 1/2) = floor((2 · ht · taux + 10000) / 20000), division euclidienne vers le bas.
  const numerateur = 2n * BigInt(htCentimes) * BigInt(taux) + 10000n;
  const quotient = numerateur / 20000n;
  return Number(numerateur < 0n && numerateur % 20000n !== 0n ? quotient - 1n : quotient);
}

/** `absents` : parmi les manquants, ceux dont la grille n'a aucun tarif (les autres ont un tarif sans prix utilisable). */
export type PrixDeLaGrille = { prix: PrixApport; manquants: PrixManquant[]; absents: PrixManquant[] };

/**
 * La conversion grille → données de calcul de l'apport.
 * - Talk et Konnect : le tarif du même code, à la salle, en HT tel quel.
 * - Connecteur RIS : le tarif en pourcentage, le pour-mille × 10 en points de base.
 * - Installations : INSTALLATION_TALK et INSTALLATION_KONNECT, ramenés en TTC ;
 *   leur base donne le mode (par site, par groupe, par salle).
 * Un tarif absent, sans montant ou d'une autre base compte pour zéro et figure
 * dans `manquants`.
 */
export function prixDepuisGrille(grille: Pick<GrilleEnVigueur, "tarifs">, tvaPdm: number): PrixDeLaGrille {
  const manquants: PrixManquant[] = [];
  const tarif = (code: PrixManquant) => grille.tarifs.find((t) => t.code === code) ?? null;
  const absents = (["TALK", "KONNECT", "CONNECTEUR_RIS", "INSTALLATION_TALK", "INSTALLATION_KONNECT"] as const).filter((code) => tarif(code) === null);
  const montant = (code: "TALK" | "KONNECT", t: TarifGrille | null) => {
    if (t && t.base === "PAR_SALLE" && t.montantHtCentimes != null) return t.montantHtCentimes;
    manquants.push(code);
    return 0;
  };
  const talkHtCentimes = montant("TALK", tarif("TALK"));
  const konnectHtCentimes = montant("KONNECT", tarif("KONNECT"));
  const ris = tarif("CONNECTEUR_RIS");
  let connecteurRisPdm = 0;
  if (ris && ris.base === "POURCENTAGE" && ris.pourMille != null) connecteurRisPdm = ris.pourMille * 10;
  else manquants.push("CONNECTEUR_RIS");
  const installation = (code: "INSTALLATION_TALK" | "INSTALLATION_KONNECT"): InstallationApport => {
    const t = tarif(code), mode = t ? MODE_PAR_BASE[t.base] : undefined;
    if (t && mode && t.montantHtCentimes != null) return { ttcCentimes: ttcDepuisHt(t.montantHtCentimes, tvaPdm), mode };
    manquants.push(code);
    // Sans tarif, aucun frais : le mode n'a alors pas d'effet.
    return { ttcCentimes: 0, mode: mode ?? "site" };
  };
  return {
    prix: { talkHtCentimes, konnectHtCentimes, connecteurRisPdm,
      installationTalk: installation("INSTALLATION_TALK"), installationKonnect: installation("INSTALLATION_KONNECT") },
    manquants,
    absents,
  };
}

const enListe = (noms: readonly string[]) => noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0];

/**
 * Ce que l'écran dit quand la grille ne donne pas tout : une phrase, ou null si
 * rien ne manque. Un tarif absent de la grille s'ajoute par son rôle ; un tarif
 * présent sans prix utilisable se renseigne : les deux conseils sont distincts.
 * Sans `absents`, chaque manquant est lu comme un tarif sans prix.
 */
export function avisGrille(g: { id: number | null; manquants: readonly PrixManquant[]; absents?: readonly PrixManquant[] }): string | null {
  if (g.id === null) return "Aucune grille tarifaire en vigueur : récurrents et commissions restent à zéro. Créez la grille sur la page Tarifs.";
  if (!g.manquants.length) return null;
  const absents = g.manquants.filter((m) => g.absents?.includes(m));
  const sansPrix = g.manquants.filter((m) => !g.absents?.includes(m));
  const phrases: string[] = [];
  if (absents.length) {
    phrases.push(`La grille en vigueur n'a pas de tarif pour ${enListe(absents.map((m) => LIBELLES_PRIX_MANQUANT[m]))}.`,
      `Ajoutez ${absents.length > 1 ? "les rôles" : "le rôle"} ${enListe(absents.map((m) => `« ${ROLES[m].libelle} »`))} sur la page Tarifs.`);
  }
  if (sansPrix.length) {
    phrases.push(`${absents.length ? "Elle" : "La grille en vigueur"} n'a pas de prix pour ${enListe(sansPrix.map((m) => LIBELLES_PRIX_MANQUANT[m]))}.`,
      `Renseignez ${sansPrix.length > 1 ? "leurs prix" : "son prix"} sur la page Tarifs.`);
  }
  phrases.push(g.manquants.length > 1 ? "Ces prix comptent pour zéro." : "Ce prix compte pour zéro.");
  return phrases.join(" ");
}

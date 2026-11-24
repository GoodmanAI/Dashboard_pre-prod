import type { CrmStatutContrat, CrmStatutProposition, CrmTypeLigne } from "@prisma/client";
import { propositionEnAttente, totauxProposition, type LigneMontant } from "@/pilot/lib/propositions/regles";

/**
 * Le montant mensuel que montrent les cartes du tableau Prospects et l'en-tête
 * de la fiche (CHOIX.md, C-70). Une seule règle pour les deux écrans. Il ne
 * stocke rien : il choisit la source.
 *
 * 1. Signé : le récurrent des contrats actifs (`recurrentSigne`), dès qu'il est
 *    positif. C'est ce que le client paie ; un avenant en cours ne le masque pas.
 * 2. En négociation : le total net mensuel de la version qui attend une
 *    réponse, selon `propositionEnAttente` : la dernière version non brouillon,
 *    si elle est envoyée ou en discussion. Un brouillon que le client n'a jamais vu ne remplace pas la
 *    version envoyée. Une version acceptée ne compte plus : son contenu est
 *    dans le contrat. Une version refusée ou expirée clôt la négociation (C-40).
 *    C'est le calcul de la fiche et du contrat (`totauxProposition`).
 * 3. Sinon la somme des opportunités ouvertes (abonnement mensuel). Elles le
 *    restent tant que le contrat est en brouillon : c'est ce que la projection
 *    compte. Elles passent en gagnées à son activation (C-71).
 * 4. Sinon, un contrat en brouillon et aucun contrat actif : pas de montant,
 *    l'écran dit de compléter et d'activer le contrat, pas d'estimer un client
 *    signé.
 * 5. Sinon rien : l'écran dit alors comment le remplir.
 */
export type PropositionPourMontant = { version: number; statut: CrmStatutProposition; remisePourMille: number; lignes: LigneMontant[] };
export type OpportunitePourMontant = { montantMensuelCentimes: number; gagneeLe: Date | string | null; perdueLe: Date | string | null };
export type ContratPourMontant = { statut: CrmStatutContrat; lignes: readonly { type: CrmTypeLigne; montantCentimes: number }[] };
export type MontantAffiche = {
  centimes: number;
  source: "CONTRAT" | "PROPOSITION" | "ESTIME";
  /** Numéro de la version, pour une proposition. */
  version: number | null;
  /** « signé », « proposition v2 » ou « estimé » : ce que l'écran écrit à côté du montant. */
  libelle: string;
} | {
  /** Un contrat en brouillon, sans autre source : aucun montant à montrer encore. */
  centimes: null;
  source: "BROUILLON";
  version: null;
  /** La phrase que l'écran écrit à la place du montant. */
  libelle: string;
};

/** Un contrat en brouillon, sans autre source : ce qu'il reste à faire, pour un compte qui modifie les montants. */
export const CONTRAT_EN_BROUILLON = "Contrat en brouillon. Complétez ses lignes et activez-le dans l'onglet Argent.";
/** Le même cas sur la carte du tableau, pour un compte sans le droit de modifier les montants : il n'a rien à faire. */
export const CONTRAT_EN_BROUILLON_COURT = "Contrat en brouillon.";
/** Le même cas dans l'en-tête de la fiche, sans ce droit : qui peut le faire. */
export const CONTRAT_EN_BROUILLON_SANS_DROIT = "Contrat en brouillon. Un compte qui modifie les montants peut le compléter et l'activer.";

/** Le récurrent signé : les lignes d'abonnement des contrats actifs, en centimes. La fiche et le tableau Prospects l'appellent tous deux. */
export function recurrentSigne(contrats: readonly ContratPourMontant[]): number {
  return contrats.filter((c) => c.statut === "ACTIF").flatMap((c) => c.lignes)
    .filter((l) => l.type === "ABONNEMENT").reduce((total, l) => total + l.montantCentimes, 0);
}

/** Un contrat en brouillon et aucun contrat actif : le cas 4 de `montantAffiche`. */
export function brouillonSansContratActif(contrats: readonly { statut: CrmStatutContrat }[]): boolean {
  return !contrats.some((c) => c.statut === "ACTIF") && contrats.some((c) => c.statut === "BROUILLON");
}

/** `contratEnBrouillon` : un brouillon existe et aucun contrat n'est actif (`brouillonSansContratActif`). */
export function montantAffiche(propositions: readonly PropositionPourMontant[], opportunites: readonly OpportunitePourMontant[], recurrentSigneCentimes = 0, contratEnBrouillon = false): MontantAffiche | null {
  if (recurrentSigneCentimes > 0) return { centimes: recurrentSigneCentimes, source: "CONTRAT", version: null, libelle: "signé" };
  // La négociation se lit sur la dernière version non brouillon (`propositionEnAttente`) : un refus, une
  // expiration ou une acceptation la clôt, une ancienne version restée ouverte ne la rouvre pas (C-40).
  const derniere = propositionEnAttente(propositions);
  if (derniere) {
    const centimes = totauxProposition(derniere.lignes, derniere.remisePourMille).abonnementMensuelCentimes;
    // Une version sans abonnement n'a pas de montant mensuel : on ne masque pas l'estimé par un zéro.
    if (centimes > 0) return { centimes, source: "PROPOSITION", version: derniere.version, libelle: `proposition v${derniere.version}` };
  }
  const estime = opportunites.filter((o) => !o.gagneeLe && !o.perdueLe).reduce((total, o) => total + o.montantMensuelCentimes, 0);
  if (estime > 0) return { centimes: estime, source: "ESTIME", version: null, libelle: "estimé" };
  return contratEnBrouillon ? { centimes: null, source: "BROUILLON", version: null, libelle: CONTRAT_EN_BROUILLON } : null;
}

/**
 * Un client sans contrat actif (D-4, C-92) : signé, en mise en service ou en
 * service, mais aucun contrat n'est actif. Son chiffre d'affaires n'est pas
 * signé : on l'estime, à part, en attendant que le contrat soit saisi.
 *
 * La source, dans cet ordre :
 * 1. le contrat en brouillon, s'il porte déjà des lignes d'abonnement : c'est
 *    le contrat en train d'être saisi ;
 * 2. la dernière proposition acceptée ;
 * 3. sinon la dernière proposition envoyée, quelle que soit sa réponse ;
 * 4. sinon les opportunités ouvertes.
 * `centimes` vaut 0 quand aucune source ne donne de montant : le client reste
 * « contrat à saisir », sans montant à montrer.
 */
export type SourceEstime = "BROUILLON" | "PROPOSITION_ACCEPTEE" | "PROPOSITION" | "OPPORTUNITES" | "AUCUNE";
export type EstimeSansContrat = { centimes: number; source: SourceEstime; version: number | null; origine: string };
export const LIBELLE_ESTIME_CLIENT = "estimé, contrat à saisir";
/** Un client sans contrat actif, sans rien pour l'estimer : ce que l'écran écrit à la place du montant. */
export const CONTRAT_A_SAISIR = "Contrat à saisir. Aucun montant pour l'estimer : saisissez le contrat dans l'onglet Argent.";
export const CONTRAT_A_SAISIR_SANS_DROIT = "Contrat à saisir. Un compte qui modifie les montants peut le saisir.";

export function estimeSansContrat(d: {
  client: boolean; contrats: readonly ContratPourMontant[];
  propositions: readonly PropositionPourMontant[]; opportunites: readonly OpportunitePourMontant[];
}): EstimeSansContrat | null {
  if (!d.client || d.contrats.some((c) => c.statut === "ACTIF")) return null;
  const brouillon = d.contrats.filter((c) => c.statut === "BROUILLON").flatMap((c) => c.lignes)
    .filter((l) => l.type === "ABONNEMENT").reduce((t, l) => t + l.montantCentimes, 0);
  if (brouillon > 0) return { centimes: brouillon, source: "BROUILLON", version: null, origine: "d'après le contrat en brouillon" };
  const derniere = (statuts: readonly CrmStatutProposition[]) => d.propositions.filter((p) => statuts.includes(p.statut))
    .reduce<PropositionPourMontant | null>((a, p) => (!a || p.version > a.version ? p : a), null);
  const mensuel = (p: PropositionPourMontant) => totauxProposition(p.lignes, p.remisePourMille).abonnementMensuelCentimes;
  const acceptee = derniere(["ACCEPTEE"]);
  if (acceptee && mensuel(acceptee) > 0) return { centimes: mensuel(acceptee), source: "PROPOSITION_ACCEPTEE", version: acceptee.version,
    origine: `d'après la proposition v${acceptee.version} acceptée` };
  const envoyee = derniere(["ENVOYEE", "EN_DISCUSSION", "REFUSEE", "EXPIREE", "ACCEPTEE"]);
  if (envoyee && mensuel(envoyee) > 0) return { centimes: mensuel(envoyee), source: "PROPOSITION", version: envoyee.version,
    origine: `d'après la proposition v${envoyee.version}` };
  const opportunites = d.opportunites.filter((o) => !o.gagneeLe && !o.perdueLe).reduce((t, o) => t + o.montantMensuelCentimes, 0);
  if (opportunites > 0) return { centimes: opportunites, source: "OPPORTUNITES", version: null, origine: "d'après les opportunités ouvertes" };
  return { centimes: 0, source: "AUCUNE", version: null, origine: "aucune source pour l'estimer" };
}

/**
 * Le montant d'un dossier, pour la carte du tableau Prospects, l'en-tête de la
 * fiche et la liste des clients : un client sans contrat actif montre son
 * estimé, « estimé, contrat à saisir » (C-92) ; sinon la règle de C-70.
 */
export function montantDuDossier(d: {
  client: boolean; contrats: readonly ContratPourMontant[];
  propositions: readonly PropositionPourMontant[]; opportunites: readonly OpportunitePourMontant[];
}): MontantAffiche | null {
  const estime = estimeSansContrat(d);
  if (estime) return estime.centimes > 0
    ? { centimes: estime.centimes, source: "ESTIME", version: estime.version, libelle: LIBELLE_ESTIME_CLIENT }
    : { centimes: null, source: "BROUILLON", version: null, libelle: CONTRAT_A_SAISIR };
  return montantAffiche(d.propositions, d.opportunites, recurrentSigne(d.contrats), brouillonSansContratActif(d.contrats));
}

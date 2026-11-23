import type { CrmCibleCommentaire, CrmDepartement, CrmStatutDemande } from "@prisma/client";
import { LIBELLES_DEPARTEMENT } from "@/pilot/lib/acces/departements";
import { enRetard } from "@/pilot/lib/demandes/regles";
import { compter } from "@/pilot/lib/texte";
import { LONGUEUR_COMMENTAIRE, nettoyerCommentaire } from "@/pilot/lib/validation/commentaire";

/**
 * Ce que l'écran dit d'un commentaire (lot T). Fonctions pures : la fiche, le
 * bloc « Pour vous » d'Aujourd'hui et la pastille du menu les lisent, et leurs
 * tests tiennent les phrases.
 */

/** À partir de là (1 800 signes sur 2 000), le compteur se colore : il reste de quoi finir sa phrase. */
export const SEUIL_COMPTEUR = Math.round(LONGUEUR_COMMENTAIRE.max * 0.9);

const ESPACE_INSECABLE = " ";

/** « 1 234 » : le séparateur de milliers à la française, sans dépendre des réglages régionaux du navigateur. */
export function milliers(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE);
}

/**
 * Signes comptés comme le serveur, après le même nettoyage (`nettoyerCommentaire`) :
 * retours à la ligne uniformes, invisibles retirés, espaces des bouts rognés,
 * puis points de code (un emoji vaut un signe).
 */
export function longueurSaisie(texte: string): number {
  return Array.from(nettoyerCommentaire(texte)).length;
}

export type CompteurSaisie = { libelle: string; niveau: "normal" | "proche" | "depasse" };

/** Le compteur discret sous la zone d'écriture : « 120 / 2 000 », orange près de la limite, rouge au-delà. */
export function compteurSaisie(texte: string): CompteurSaisie {
  const n = longueurSaisie(texte);
  return {
    libelle: `${milliers(n)} / ${milliers(LONGUEUR_COMMENTAIRE.max)}`,
    niveau: n > LONGUEUR_COMMENTAIRE.max ? "depasse" : n >= SEUIL_COMPTEUR ? "proche" : "normal",
  };
}

export type Adresse = {
  cible: CrmCibleCommentaire;
  departement: CrmDepartement | null;
  /** Null si la personne visée n'a plus de compte. */
  personneId: number | null;
  /** Le nom de la personne visée, tel que le fil le rend. */
  cibleLibelle: string;
};

/**
 * À qui le commentaire a été adressé, en clair : « À tout le monde », « Au
 * département Projet », « À Commercial A » (« À vous » pour la personne visée).
 * Sans alerte, la ligne le dit : l'écran ne laisse pas deviner.
 */
export function phraseAdresse(a: Adresse, moiId: number): string {
  switch (a.cible) {
    case "AUCUN": return "Sans alerte";
    case "TOUS": return "À tout le monde";
    case "DEPARTEMENT": return a.departement ? `Au département ${LIBELLES_DEPARTEMENT[a.departement]}` : "À un département";
    case "PERSONNE":
      if (a.personneId === null) return "À un compte supprimé";
      return a.personneId === moiId ? "À vous" : `À ${a.cibleLibelle}`;
  }
}

/** La phrase du fil : pour l'auteur, elle ajoute combien de personnes ont été prévenues. */
export function phraseFil(a: Adresse & { nombreDestinataires: number; auteurId: number | null }, moiId: number): string {
  const base = phraseAdresse(a, moiId);
  if (a.cible === "AUCUN" || a.auteurId !== moiId) return base;
  return `${base} · ${compter(a.nombreDestinataires, "personne prévenue", "personnes prévenues")}`;
}

/** « 13 nov. 2026, 14:32 », à l'heure de Paris : la même chose sur le serveur et dans le navigateur, quel que soit le fuseau de la machine. */
export function dateHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

/**
 * Un extrait court d'un texte libre : espaces et retours à la ligne ramenés à
 * un seul espace, coupé à la fin d'un mot quand c'est possible, suivi de « … ».
 * Compté en points de code : un emoji n'est jamais coupé en deux.
 */
export function extrait(texte: string, maximum = 140): string {
  const net = texte.replace(/\s+/g, " ").trim();
  const signes = Array.from(net);
  if (signes.length <= maximum) return net;
  const coupe = signes.slice(0, maximum).join("");
  const motComplet = signes[maximum] === " ";
  const dernierEspace = coupe.lastIndexOf(" ");
  const base = !motComplet && dernierEspace >= maximum * 0.6 ? coupe.slice(0, dernierEspace) : coupe;
  return `${base.replace(/[\s,;:.!?-]+$/, "")}…`;
}

type Datee = { id: number; creeLe: string };

/** Plus ancien dans l'ordre du fil (date décroissante, puis identifiant décroissant). Dates ISO : l'ordre des chaînes est celui des instants. */
const avant = (a: Datee, b: Datee) => a.creeLe < b.creeLe || (a.creeLe === b.creeLe && a.id < b.id);

/**
 * Le fil après une relecture de la page (une autre action de la fiche a relu
 * le serveur) : la première page fraîche remplace la première page affichée,
 * et les pages plus anciennes déjà chargées restent, avec leur curseur. Sans
 * suite côté serveur, la page fraîche est tout le fil : ce qui était chargé
 * au-delà a été supprimé entre-temps.
 */
export function garderPagesChargees<L extends Datee>(charge: { lignes: readonly L[]; curseur: string | null }, frais: { commentaires: readonly L[]; suite: boolean; curseur: string | null }): { lignes: L[]; curseur: string | null } {
  const dernier = frais.commentaires.at(-1);
  if (!frais.suite || !dernier) return { lignes: [...frais.commentaires], curseur: frais.suite ? frais.curseur : null };
  const presents = new Set(frais.commentaires.map((l) => l.id));
  const anciennes = charge.lignes.filter((l) => !presents.has(l.id) && avant(l, dernier));
  return anciennes.length ? { lignes: [...frais.commentaires, ...anciennes], curseur: charge.curseur } : { lignes: [...frais.commentaires], curseur: frais.curseur };
}

type DemandeDatee = Datee & { statut: CrmStatutDemande; echeanceLe: string | null };
type ElementDemande<D> = { genre: "demande"; cle: string; creeLe: string; enRetard: boolean; demande: D };
type ElementCommentaire<C> = { genre: "commentaire"; cle: string; creeLe: string; enRetard: false; commentaire: C };
export type ElementPourVous<D extends DemandeDatee, C extends Datee> = ElementDemande<D> | ElementCommentaire<C>;

/**
 * « Pour vous » : les demandes ouvertes et les commentaires non lus dans une
 * seule liste. D'abord les demandes en retard, de la plus ancienne échéance à
 * la plus récente (l'identifiant le plus petit départage). Puis le reste,
 * demandes et commentaires mêlés, du plus récent au plus ancien ; à date
 * égale, la demande passe avant le commentaire (elle demande une action), puis
 * l'identifiant le plus grand. L'ordre ne dépend jamais de celui des entrées.
 * `debutDuJour` : minuit UTC du jour, comme `enRetard` des demandes.
 */
export function fusionnerPourVous<D extends DemandeDatee, C extends Datee>(demandes: readonly D[], commentaires: readonly C[], debutDuJour: Date): ElementPourVous<D, C>[] {
  const lignes = demandes.map((demande): ElementDemande<D> =>
    ({ genre: "demande", cle: `d${demande.id}`, creeLe: demande.creeLe, enRetard: enRetard(demande, debutDuJour), demande }));
  const retard = lignes.filter((e) => e.enRetard)
    .sort((a, b) => Date.parse(a.demande.echeanceLe ?? "") - Date.parse(b.demande.echeanceLe ?? "") || a.demande.id - b.demande.id);
  const reste: ElementPourVous<D, C>[] = [
    ...lignes.filter((e) => !e.enRetard),
    ...commentaires.map((commentaire): ElementCommentaire<C> => ({ genre: "commentaire", cle: `c${commentaire.id}`, creeLe: commentaire.creeLe, enRetard: false, commentaire })),
  ];
  const id = (e: ElementPourVous<D, C>) => (e.genre === "demande" ? e.demande.id : e.commentaire.id);
  reste.sort((a, b) =>
    Date.parse(b.creeLe) - Date.parse(a.creeLe)
    || (a.genre === b.genre ? 0 : a.genre === "demande" ? -1 : 1)
    || id(b) - id(a));
  return [...retard, ...reste];
}

/** Le chiffre de la pastille : « 99+ » au-delà, rien à zéro. */
export function chiffrePastille(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

/** Ce que la pastille veut dire, pour un lecteur d'écran et pour le titre de la tuile. */
export function phrasePourVous(demandes: number, commentaires: number): string {
  const parties = [
    demandes > 0 ? compter(demandes, "demande à traiter", "demandes à traiter") : null,
    commentaires > 0 ? compter(commentaires, "commentaire non lu", "commentaires non lus") : null,
  ].filter((p): p is string => p !== null);
  return parties.length ? parties.join(" et ") : "Rien de nouveau pour vous";
}

export type ComptePourVous = { demandes: number; commentaires: number };

/** La réponse de `GET /api/pilot/pour-vous/compte`, vérifiée : deux entiers positifs ou nuls, sinon null (l'écran garde alors l'ancien chiffre). */
export function lireComptePourVous(valeur: unknown): ComptePourVous | null {
  if (typeof valeur !== "object" || valeur === null) return null;
  const { demandes, commentaires } = valeur as Record<string, unknown>;
  const entier = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return entier(demandes) && entier(commentaires) ? { demandes, commentaires } : null;
}

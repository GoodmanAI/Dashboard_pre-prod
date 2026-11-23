import type { CrmDepartement } from "@prisma/client";
import { DEPARTEMENTS, LIBELLES_DEPARTEMENT, libelleDepartement } from "@/pilot/lib/acces/departements";
import { compter } from "@/pilot/lib/texte";
import { calculerDestinataires, type CompteEquipe } from "./destinataires";

/**
 * Ce que le sélecteur « Prévenir » propose à l'auteur (lot T). Les nombres
 * viennent de `calculerDestinataires`, la règle même que le serveur applique à
 * l'écriture : l'écran ne promet jamais une alerte que le serveur refuserait.
 */
export type OptionPersonne = { id: number; nom: string; departement: CrmDepartement | null };
export type OptionDepartement = { departement: CrmDepartement; nombre: number };
export type Cibles = {
  /** Les comptes de l'équipe actifs, l'auteur exclu, par ordre alphabétique. */
  personnes: OptionPersonne[];
  /** Tous les départements, dans l'ordre de l'écran, avec le nombre de personnes qu'une alerte préviendrait. */
  departements: OptionDepartement[];
  /** Le nombre de personnes qu'une alerte à tout le monde préviendrait. */
  tous: number;
};

const nombreDe = (r: ReturnType<typeof calculerDestinataires>) => (r.ok ? r.destinataires.length : 0);

export function calculerCibles(equipe: readonly CompteEquipe[], auteurId: number): Cibles {
  const personnes = equipe
    .filter((c) => calculerDestinataires({ cible: "PERSONNE", personneId: c.id }, auteurId, equipe).ok)
    .map((c) => ({ id: c.id, nom: c.nom?.trim() || "Sans nom", departement: c.departement }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.id - b.id);
  return {
    personnes,
    departements: DEPARTEMENTS.map((departement) => ({ departement, nombre: nombreDe(calculerDestinataires({ cible: "DEPARTEMENT", departement }, auteurId, equipe)) })),
    tous: nombreDe(calculerDestinataires({ cible: "TOUS" }, auteurId, equipe)),
  };
}

/** « Projet, 3 personnes ». Vide : la ligne le dit et ne se choisit pas. */
export function libelleOptionDepartement(o: OptionDepartement): string {
  const nom = LIBELLES_DEPARTEMENT[o.departement];
  return o.nombre > 0 ? `${nom}, ${compter(o.nombre, "personne")}` : `${nom}, personne d'autre pour l'instant`;
}

/** « Tout le monde, 4 personnes ». */
export function libelleOptionTous(tous: number): string {
  return tous > 0 ? `Tout le monde, ${compter(tous, "personne")}` : "Tout le monde, personne d'autre pour l'instant";
}

/** « Commercial A, département Commercial » ; sans département choisi, le nom seul. */
export function libelleOptionPersonne(p: OptionPersonne): string {
  return p.departement ? `${p.nom}, département ${libelleDepartement(p.departement)}` : p.nom;
}

export type ChoixPrevenir = "AUCUN" | "TOUS" | "DEPARTEMENT" | "PERSONNE";

/** Les genres de cible proposés, dans l'ordre du sélecteur, avec ce qu'ils disent. */
export const GENRES_PREVENIR: { valeur: ChoixPrevenir; libelle: string }[] = [
  { valeur: "AUCUN", libelle: "Personne" },
  { valeur: "TOUS", libelle: "Tout le monde" },
  { valeur: "DEPARTEMENT", libelle: "Un département" },
  { valeur: "PERSONNE", libelle: "Une personne" },
];

/**
 * Pourquoi un genre de cible ne peut pas se choisir, ou null. Une alerte à
 * personne est refusée par le serveur : l'écran le dit avant l'envoi.
 */
export function raisonGenreImpossible(genre: ChoixPrevenir, cibles: Cibles): string | null {
  switch (genre) {
    case "AUCUN": return null;
    case "TOUS": return cibles.tous > 0 ? null : "Personne d'autre n'est dans l'équipe.";
    case "DEPARTEMENT": return cibles.departements.some((d) => d.nombre > 0) ? null : "Aucun département n'a encore de membre. Le super-administrateur les choisit dans Équipe.";
    case "PERSONNE": return cibles.personnes.length > 0 ? null : "Personne d'autre n'est dans l'équipe.";
  }
}

/** Ce que l'écran explique sous le sélecteur, selon le choix : à qui l'alerte ira. */
export function aideGenre(genre: ChoixPrevenir): string {
  switch (genre) {
    case "AUCUN": return "Le commentaire reste sur la fiche. Personne n'est prévenu.";
    case "TOUS": return "Chacun le verra dans Aujourd'hui, sous « Pour vous ».";
    case "DEPARTEMENT": return "Les membres du département le verront dans Aujourd'hui, sous « Pour vous ».";
    case "PERSONNE": return "Cette personne le verra dans Aujourd'hui, sous « Pour vous ».";
  }
}

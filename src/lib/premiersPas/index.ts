import type { SlugProduit } from "@/lib/produits";
import type { Chapitre } from "@/lib/tutoriel/types";
import { CHAPITRES_TALK } from "@/lib/tutoriel/talk";

/**
 * Ce que chaque utilisateur a fait de son tutoriel (`User.premiersPas`, plans
 * `2026-10-onboarding-dashboard-talk.md` puis `2026-10-tutoriel-client-talk.md`).
 *
 * La colonne est du JSON libre : la lecture est défensive, une valeur abîmée ne doit
 * jamais casser l'accueil. Les chapitres eux-mêmes vivent dans `src/lib/tutoriel/`.
 *
 * **L'état « à faire / à vérifier » d'un chapitre ne se stocke pas.** Il vient du
 * registre de complétude, recalculé à chaque lecture.
 */

export type EtatPremiersPas = {
  /**
   * Sommaire de l'accueil rangé (« Masquer »). Le SQL du 29/10 le pose aussi sur tous
   * les comptes antérieurs : eux ne voient ni le sommaire ni la visite automatique.
   */
  masque: boolean;
  /** La visite de bienvenue a déjà été lancée une fois : elle ne repart plus seule. */
  visite: boolean;
  /** Chapitres parcourus jusqu'au bout. */
  chapitres: string[];
};

export const CHAPITRES: Partial<Record<SlugProduit, Chapitre[]>> = {
  talk: CHAPITRES_TALK,
};

export function chapitresDuProduit(produit: SlugProduit | null): Chapitre[] {
  return (produit && CHAPITRES[produit]) || [];
}

function listeDeTextes(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/** `null` (jamais ouverts) : sommaire visible, visite à lancer. */
export function lireEtat(brut: unknown): EtatPremiersPas {
  const o =
    brut && typeof brut === "object" && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : {};
  return {
    masque: o.masque === true,
    visite: o.visite === true,
    chapitres: listeDeTextes(o.chapitres),
  };
}

/** Ce que le navigateur peut demander. Une seule action à la fois. */
export type ActionPremiersPas =
  { masque: boolean } | { visite: true } | { chapitre: string };

const CLE = /^[a-z_.-]{1,60}$/;

/** Applique une action à l'état. `null` si l'action est mal formée. */
export function appliquer(
  etat: EtatPremiersPas,
  action: unknown,
): EtatPremiersPas | null {
  if (!action || typeof action !== "object") return null;
  const a = action as Record<string, unknown>;
  if (typeof a.masque === "boolean") return { ...etat, masque: a.masque };
  if (a.visite === true) return { ...etat, visite: true };
  if (typeof a.chapitre === "string" && CLE.test(a.chapitre)) {
    return etat.chapitres.includes(a.chapitre)
      ? etat
      : { ...etat, chapitres: [...etat.chapitres, a.chapitre] };
  }
  return null;
}

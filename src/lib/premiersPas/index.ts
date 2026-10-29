import type { SlugProduit } from "@/lib/produits";
import { ETAPES_TALK } from "./talk";

/**
 * Premiers pas d'un nouveau client (plan `2026-10-onboarding-dashboard-talk.md`).
 *
 * Deux choses vivent ici, et seulement deux :
 *   - la forme de `User.premiersPas` et sa lecture défensive (la colonne est du JSON
 *     libre : une valeur abîmée ne doit jamais casser l'accueil) ;
 *   - la liste des étapes par produit, déclarée dans `talk.ts` (et demain `konnect.ts`).
 *     Le composant ne connaît aucune étape : ajouter Konnect ne le touche pas.
 *
 * **L'état « fait » d'une étape ne se stocke pas.** Il vient du registre de
 * complétude, recalculé à chaque lecture : un mapping vidé plus tard redevient « à
 * faire ». Seule une étape sans verdict possible (les doubles examens) se marque lue.
 */

export type EtatPremiersPas = {
  /** Carte rangée par la personne (« Masquer »), ou compte antérieur à la fonction. */
  masque: boolean;
  /** Étapes sans verdict de complétude, marquées « J'ai compris ». */
  lus: string[];
  /** Phrases des pages de statistiques déjà fermées. */
  phrases: string[];
};

export type EtapePremiersPas = {
  /** Clé stable, écrite en base dans `lus` : ne jamais la renommer. */
  cle: string;
  titre: string;
  /** Deux lignes au plus. Le détail champ par champ reste dans les écrans. */
  texte: string;
  /** Ce que l'encart dit sur la page d'arrivée. */
  consigne: string;
  /** Sous-chemin de l'écran, relatif au produit (`parametrage/mapping_exam`). */
  chemin: string;
  /** `id` de l'élément à amener et entourer sur la page d'arrivée. */
  ancre: string;
  /**
   * Clés du registre de complétude qui doivent être sans manque. Vide : aucune
   * vérification possible, l'étape se coche par « J'ai compris ».
   */
  completude: string[];
};

/** Paramètre d'URL qui porte le numéro d'étape vers la page d'arrivée. */
export const PARAM_ETAPE = "premiers_pas";

export const ETAPES: Partial<Record<SlugProduit, EtapePremiersPas[]>> = {
  talk: ETAPES_TALK,
};

export function etapesDuProduit(
  produit: SlugProduit | null,
): EtapePremiersPas[] {
  return (produit && ETAPES[produit]) || [];
}

function listeDeTextes(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/** `null` (jamais ouverts) donne une carte visible ; tout le reste est lu sans confiance. */
export function lireEtat(brut: unknown): EtatPremiersPas {
  const o =
    brut && typeof brut === "object" && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : {};
  return {
    masque: o.masque === true,
    lus: listeDeTextes(o.lus),
    phrases: listeDeTextes(o.phrases),
  };
}

/** Ce que le navigateur peut demander. Une seule action à la fois. */
export type ActionPremiersPas =
  { masque: boolean } | { lu: string } | { phrase: string };

const CLE = /^[a-z_.-]{1,60}$/;

/** Applique une action à l'état. `null` si l'action est mal formée. */
export function appliquer(
  etat: EtatPremiersPas,
  action: unknown,
): EtatPremiersPas | null {
  if (!action || typeof action !== "object") return null;
  const a = action as Record<string, unknown>;
  if (typeof a.masque === "boolean") return { ...etat, masque: a.masque };
  if (typeof a.lu === "string" && CLE.test(a.lu)) {
    return etat.lus.includes(a.lu)
      ? etat
      : { ...etat, lus: [...etat.lus, a.lu] };
  }
  if (typeof a.phrase === "string" && CLE.test(a.phrase)) {
    return etat.phrases.includes(a.phrase)
      ? etat
      : { ...etat, phrases: [...etat.phrases, a.phrase] };
  }
  return null;
}

/** Une étape est faite si la personne l'a lue, ou si aucune de ses clés ne manque. */
export function etapeFaite(
  etape: EtapePremiersPas,
  etat: EtatPremiersPas,
  manques: ReadonlySet<string>,
): boolean {
  if (etape.completude.length === 0) return etat.lus.includes(etape.cle);
  return etape.completude.every((c) => !manques.has(c));
}

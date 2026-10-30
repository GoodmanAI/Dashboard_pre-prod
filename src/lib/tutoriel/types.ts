import type { PageKey } from "@/lib/permissions";

/**
 * Le tutoriel du client (plan `2026-10-tutoriel-client-talk.md`).
 *
 * Un chapitre est une suite d'étapes ; une étape désigne un élément de l'écran réel par
 * son ancre (les `id` posés pour la recherche centrale, plus quelques-uns pour le
 * tutoriel). Une étape sans cible, ou dont la cible manque à l'écran (téléphone, liste
 * vide), s'affiche au centre sans rien entourer : la visite ne bloque jamais.
 */

/**
 * Ce que le registre de complétude dit d'un chapitre qui a des champs obligatoires.
 * `a_faire` : il en manque, on insiste. `a_verifier` : rempli (par le client ou importé
 * par l'admin), on demande de relire. `null` : rien à vérifier pour ce chapitre.
 */
export type EtatChapitre = "a_faire" | "a_verifier" | null;

export type Etape = {
  /**
   * Écran de l'étape, relatif au produit (`""` = accueil, `"parametrage/mapping_exam"`).
   * Absent : l'écran de l'étape précédente.
   */
  chemin?: string;
  /** Sélecteur de l'élément à éclairer, par exemple `#rappel_sms`. */
  cible?: string;
  titre: string;
  /** Une fonction quand le texte dépend de ce qui est déjà rempli. */
  texte: string | ((etat: EtatChapitre) => string);
  /** Droit de page exigé pour cette étape, s'il diffère de celui du chapitre. */
  page?: PageKey;
};

export type Chapitre = {
  /** Clé stable, écrite en base dans `premiersPas.chapitres` : ne jamais la renommer. */
  cle: string;
  titre: string;
  /** Une ligne, dans la liste des chapitres. */
  resume: string;
  /** Droit de page exigé pour voir le chapitre. `null` : tout le monde. */
  page: PageKey | null;
  /** Clés du registre de complétude qui décident de son état. */
  completude?: string[];
  /** Mis en avant dans la liste tant qu'il est à faire. */
  primordial?: boolean;
  etapes: Etape[];
};

export function etatChapitre(
  chapitre: Chapitre,
  manques: ReadonlySet<string> | null,
): EtatChapitre {
  if (
    !chapitre.completude ||
    chapitre.completude.length === 0 ||
    manques === null
  )
    return null;
  return chapitre.completude.some((c) => manques.has(c))
    ? "a_faire"
    : "a_verifier";
}

export function texteEtape(etape: Etape, etat: EtatChapitre): string {
  return typeof etape.texte === "function" ? etape.texte(etat) : etape.texte;
}

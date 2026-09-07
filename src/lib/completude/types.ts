/**
 * Socle du registre de complétude (lot 2 du plan
 * `2026-09-completude-config-centres.md`).
 *
 * **Une information essentielle est déclarée UNE FOIS, ici, et quatre choses la
 * lisent** : la route `/api/completude`, le bandeau client, le bandeau
 * administrateur, et les deux pages d'installation. Sans ce registre, les mêmes
 * règles vivraient en quatre exemplaires qui divergeraient — c'est exactement ce
 * qui est arrivé aux diminutifs d'examens, saisis côté client et ignorés par le
 * robot, qui utilise sa propre copie en dur.
 *
 * Le registre dit CE QUI MANQUE. Il ne dit pas ce qu'on en affiche : c'est le
 * statut du centre (`src/lib/centreStatut.ts`) qui en décide. Les deux sont
 * délibérément séparés, pour qu'un centre puisse changer de statut sans rien
 * recalculer.
 */

/** À qui appartient la saisie de cette information. */
export type Proprietaire = "client" | "admin";

/**
 * Ce qu'il se passe si l'information manque.
 *
 *   - `bloquant` : le produit ne peut pas faire son métier.
 *   - `degrade`  : il tourne, mais une fonction est morte.
 *   - `confort`  : un défaut acceptable s'applique.
 *
 * Seuls les deux premiers produisent un bandeau. Le troisième n'apparaît que
 * dans les pages d'installation, où l'on regarde un centre en détail.
 */
export type Criticite = "bloquant" | "degrade" | "confort";

export const ORDRE_CRITICITE: Criticite[] = ["bloquant", "degrade", "confort"];

/** Ce qu'il faut pour construire un lien de correction. */
export type ContexteLien = {
  /** L'identifiant du CLIENT, pas du couple client × produit : c'est lui qui est dans l'URL. */
  userId: number;
};

/**
 * Une information attendue.
 *
 * `C` est l'instantané de configuration du produit concerné — ce que la route a
 * lu en base. Le typer par produit évite qu'une exigence LyraeTalk aille lire un
 * champ Konnect qui n'existe pas.
 */
export type Exigence<C> = {
  /** Slug stable, namespacé par produit. Le renommer orpheline les références. */
  cle: string;
  /** Nom de l'information, tel qu'affiché. */
  libelle: string;
  proprietaire: Proprietaire;
  /**
   * Constante, ou calculée depuis la configuration.
   *
   * La forme calculée n'est pas un raffinement théorique : un numéro de
   * redirection ABSENT dégrade le service (le patient part au secrétariat
   * général), un numéro de redirection FAUX le casse (on dicte au patient un
   * numéro qui ne répond pas). Deux criticités pour une même exigence.
   */
  criticite: Criticite | ((config: C) => Criticite);
  /**
   * Le texte affiché quand l'information manque. **La conséquence d'abord,
   * l'action ensuite** : « Le robot ne peut transférer aucun appel. Renseignez
   * le numéro du secrétariat. » Jamais « Champ obligatoire manquant ».
   *
   * Peut dépendre de la configuration, pour nommer le type d'examen concerné.
   */
  manque: string | ((config: C) => string);
  /** Où corriger. Même URL pour les deux rôles, cf. `cheminCentre`. */
  href: (ctx: ContexteLien) => string;
  /** L'information est-elle présente et valide ? */
  satisfaite: (config: C) => boolean;
};

/** Une exigence non satisfaite, résolue et prête à afficher. */
export type Manque = {
  cle: string;
  libelle: string;
  proprietaire: Proprietaire;
  criticite: Criticite;
  manque: string;
  href: string;
};

/** Le verdict pour un centre. */
export type Completude = {
  manques: Manque[];
  bloquants: number;
  degrades: number;
  /** Nombre d'exigences évaluées, tous niveaux confondus. */
  total: number;
  /** Nombre d'exigences satisfaites. Sert à la progression « 7 sur 12 ». */
  satisfaites: number;
};

/** Résout une valeur qui peut être constante ou calculée. */
function resoudre<C, V>(valeur: V | ((config: C) => V), config: C): V {
  return typeof valeur === "function"
    ? (valeur as (config: C) => V)(config)
    : valeur;
}

/**
 * Applique un registre à une configuration.
 *
 * Aucun filtrage ici : la complétude est TOUJOURS calculée en entier, quel que
 * soit le statut du centre ou le rôle de l'appelant. Le tri se fait au moment
 * d'afficher, parce que la page de parc a besoin de la progression d'un centre
 * en intégration, et que le jour où il passe en production rien ne doit être
 * recalculé.
 */
export function evaluer<C>(
  registre: Exigence<C>[],
  config: C,
  ctx: ContexteLien
): Completude {
  const manques: Manque[] = [];
  let satisfaites = 0;

  for (const exigence of registre) {
    if (exigence.satisfaite(config)) {
      satisfaites += 1;
      continue;
    }
    manques.push({
      cle: exigence.cle,
      libelle: exigence.libelle,
      proprietaire: exigence.proprietaire,
      criticite: resoudre(exigence.criticite, config),
      manque: resoudre(exigence.manque, config),
      href: exigence.href(ctx),
    });
  }

  // Les bloquants d'abord : un bandeau se lit de haut en bas, et l'urgent doit
  // être la première ligne.
  manques.sort(
    (a, b) =>
      ORDRE_CRITICITE.indexOf(a.criticite) - ORDRE_CRITICITE.indexOf(b.criticite)
  );

  return {
    manques,
    bloquants: manques.filter((m) => m.criticite === "bloquant").length,
    degrades: manques.filter((m) => m.criticite === "degrade").length,
    total: registre.length,
    satisfaites,
  };
}

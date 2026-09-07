/**
 * Statut de cycle de vie d'un centre — le seul endroit qui connaît les trois
 * états et ce qu'ils déclenchent (lot 1 de
 * `plans/2026-09-completude-config-centres.md`).
 *
 * **Ce statut ne pilote rien d'autre que l'affichage.** Il ne coupe pas le
 * robot, ne retire pas l'affiliation du produit, ne touche pas
 * `serviceEnabled`. Trois notions d'état existent déjà dans le Dashboard et
 * aucune ne fait ce travail :
 *
 *   - `UserProduct.removedAt` : le client n'a plus le produit. Toutes les
 *     requêtes filtrent dessus, donc le centre disparaît des écrans.
 *   - `TalkSettings.options.serviceEnabled` : le robot répond, ou transfère.
 *     Opérationnel, réversible à la minute, actionnable par le client.
 *   - `DeploymentStatus` : l'état des VMs.
 *
 * Les confondre créerait deux interrupteurs qui se contredisent. Un centre
 * classé `arrete` dont `serviceEnabled` vaut encore `true` est une incohérence
 * à SIGNALER — c'est le seul endroit du système où l'intention déclarée et
 * l'état réel se rencontrent.
 *
 * Les valeurs sont contraintes en base par `CentreStatut_statut_check` : ce
 * fichier et le CHECK doivent rester d'accord.
 */

/** Les trois états d'un centre. Stable : la valeur est stockée en base. */
export type StatutCentre = "integration" | "production" | "arrete";

/**
 * Ce que vaut un centre sans ligne en base.
 *
 * **Ce défaut n'est pas neutre.** Il rend le classement volontaire : rien ne
 * s'allume tant qu'un administrateur n'a pas déclaré un centre en production.
 * L'inverse (`production` par défaut) allumerait les alertes des neuf centres
 * existants le jour du déploiement, Quimper et Pontivy compris, dont les manques
 * sont normaux puisqu'ils sont en cours d'installation.
 */
export const STATUT_DEFAUT: StatutCentre = "integration";

/** Ordre d'affichage stable, du plus jeune au plus ancien dans la vie d'un centre. */
export const ORDRE_STATUTS: StatutCentre[] = ["integration", "production", "arrete"];

export type DescriptionStatut = {
  /** Libellé affiché. Pas de vocabulaire interne. */
  libelle: string;
  /** Une phrase qui dit ce que le statut implique, pour l'écran de parc. */
  aide: string;
  /** Couleurs de la pastille. Alignées sur celles des pages d'installation. */
  couleur: { fond: string; texte: string };
};

export const STATUTS: Record<StatutCentre, DescriptionStatut> = {
  integration: {
    libelle: "En intégration",
    aide: "On installe. Les informations manquantes sont normales et ne déclenchent aucune alerte.",
    couleur: { fond: "#EAF1F8", texte: "#1D4E7F" },
  },
  production: {
    libelle: "En production",
    aide: "Le centre prend des demandes de patients. Toutes les informations essentielles sont exigées.",
    couleur: { fond: "#E8F5EE", texte: "#186A3B" },
  },
  arrete: {
    libelle: "Arrêté",
    aide: "Le service ne tourne plus. L'historique reste consultable, aucune alerte n'est affichée.",
    couleur: { fond: "#F1F3F5", texte: "#5A6B7B" },
  },
};

/** Une valeur venue d'une requête ou d'un payload est-elle un statut connu ? */
export function estStatut(valeur: unknown): valeur is StatutCentre {
  return (
    typeof valeur === "string" &&
    (ORDRE_STATUTS as string[]).includes(valeur)
  );
}

/**
 * Le statut d'un centre, à partir de ce que renvoie la base. `null` (aucune
 * ligne) et une valeur inconnue retombent toutes deux sur le défaut : une
 * donnée abîmée doit rendre le centre silencieux, jamais bruyant.
 */
export function statutDepuisBase(valeur: unknown): StatutCentre {
  return estStatut(valeur) ? valeur : STATUT_DEFAUT;
}

/**
 * Le régime d'alertes d'un statut. C'est la matrice du plan, et c'est ici
 * qu'elle vit : le registre de complétude (lot 2) dit ce qui manque, ce statut
 * dit ce qu'on en affiche.
 *
 *   - `aucune`      : rien, nulle part. Le centre reste visible dans le parc.
 *   - `informative` : un bandeau bleu, limité aux informations dont le CLIENT
 *                     est propriétaire. Le service n'a jamais tourné, parler de
 *                     panne serait faux et inquiétant.
 *   - `complete`    : bandeau rouge pour les bloquants, ambre pour les dégradés.
 */
export type RegimeAlertes = "aucune" | "informative" | "complete";

export function regimeAlertes(statut: StatutCentre): RegimeAlertes {
  switch (statut) {
    case "production":
      return "complete";
    case "integration":
      return "informative";
    case "arrete":
      return "aucune";
  }
}

/**
 * Ce centre entre-t-il dans le compteur « N autres centres incomplets » du
 * bandeau administrateur ? Seuls les centres en production y comptent : un
 * centre en cours d'installation est incomplet par définition, l'annoncer
 * chaque jour n'apprend rien.
 */
export function compteDansLesIncomplets(statut: StatutCentre): boolean {
  return statut === "production";
}

/**
 * Ce changement de statut demande-t-il une confirmation ?
 *
 * Seul le passage en production, parce que c'est lui qui allume les alertes
 * chez le client et qui engage : on déclare qu'un centre est prêt. Les deux
 * autres transitions ne font qu'éteindre, elles sont sans risque.
 *
 * Le passage reste POSSIBLE avec des informations manquantes (décision du
 * 02/09/2026) : on ne bloque pas, on rend le risque visible. Un centre déjà en
 * service ne doit jamais être retenu par un contrôle de formulaire.
 */
export function demandeConfirmation(
  actuel: StatutCentre,
  cible: StatutCentre
): boolean {
  return cible === "production" && actuel !== "production";
}

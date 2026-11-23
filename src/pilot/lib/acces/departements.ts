import type { CrmDepartement } from "@prisma/client";

/**
 * Les départements de l'équipe (lot T). Fonctions et libellés purs : l'écran
 * Équipe, le choix d'un destinataire de commentaire et la garde serveur les lisent.
 * Les noms sont proposés, en attente de validation : on ajoute des valeurs,
 * on n'en renomme aucune, et seul ce fichier porte les libellés.
 */
export const LIBELLES_DEPARTEMENT: Record<CrmDepartement, string> = {
  COMMERCIAL: "Commercial",
  PROJET: "Projet",
  TECHNIQUE: "Technique",
  DIRECTION: "Direction",
};

/** Dans l'ordre de l'écran. */
export const DEPARTEMENTS = Object.keys(LIBELLES_DEPARTEMENT) as CrmDepartement[];

/** Sans ligne en base : la personne n'a pas de département, l'écran Équipe le demande. */
export const LIBELLE_SANS_DEPARTEMENT = "Département pas encore choisi";

export const libelleDepartement = (departement: CrmDepartement | null | undefined): string =>
  departement ? LIBELLES_DEPARTEMENT[departement] : LIBELLE_SANS_DEPARTEMENT;

import { CASES_DU_BAREME } from "./temperature";

/**
 * Les cases que le commercial coche à la main sur la fiche. Besoin et Budget
 * nourrissent le barème de température (`temperature.ts`), qui en porte les
 * libellés ; Solution actuelle n'y entre pas. Ce fichier ne donne aucun point :
 * le barème est la seule règle.
 *
 * `qualifDecideur` et `qualifCalendrier` restent en base (une colonne abandonnée
 * reste en place) mais ne se saisissent plus et ne comptent plus : le barème lit
 * le rôle des contacts et la date de décision attendue, une seule source par critère.
 */
export const CRITERES_QUALIFICATION = {
  ...CASES_DU_BAREME,
  qualifSolutionActuelle: "Solution actuelle connue",
} as const;
export type Qualification = Record<keyof typeof CRITERES_QUALIFICATION, boolean>;

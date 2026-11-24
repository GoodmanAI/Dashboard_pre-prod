import type { CrmTypeConcurrent } from "@prisma/client";

/**
 * Quand une fiche demande « Lequel ? » (lot R) : l'outil de prise de RDV ou la
 * solution actuelle désigne un concurrent. Règle pure, lue par la fiche de saisie
 * rapide. Sur la fiche d'une organisation, le champ reste toujours accessible.
 */

/** Les mots qui disent qu'un concurrent est en place : robot vocal, secrétariat ou centre d'appels externalisé. */
const MOTIF_CONCURRENT = /robot vocal|secr[ée]tariat externalis|centre d'appels|plateforme externe|concurren/i;

export function designeUnConcurrent(saisie: { outilRdv?: string | null; solutionActuelle?: string | null }): boolean {
  if (saisie.solutionActuelle?.trim()) return true;
  return MOTIF_CONCURRENT.test(saisie.outilRdv ?? "");
}

/** Le type que la création à la volée propose d'abord, d'après l'outil de RDV saisi ; sinon « Autre ». */
export function typeSuggere(outilRdv: string | null | undefined): CrmTypeConcurrent {
  const outil = outilRdv ?? "";
  if (/robot vocal/i.test(outil)) return "ROBOT_VOCAL";
  if (/secr[ée]tariat externalis/i.test(outil)) return "SECRETARIAT_EXTERNALISE";
  if (/centre d'appels|plateforme externe/i.test(outil)) return "CENTRE_APPELS";
  return "AUTRE";
}

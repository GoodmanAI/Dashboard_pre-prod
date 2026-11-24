import type { CrmEtapeCommerciale } from "@prisma/client";
import { estClient } from "@/pilot/lib/pipeline";

/**
 * Qui équipe un établissement : une seule règle, que lisent la page Concurrents
 * (comptes de la liste, fiche, partage des établissements) et la carte (lot U).
 * Aucun autre fichier ne décide qui est équipé par qui.
 *
 * - Le gagnant d'une affaire perdue l'emporte sur le concurrent en place : c'est
 *   lui qui équipe l'établissement depuis la perte.
 * - Un client de Lyrae n'est plus équipé par un concurrent, même si la fiche garde
 *   le concurrent d'avant (« Passés chez Lyrae » sur la fiche du concurrent).
 * - Un dossier perdu sans gagnant connu, ou un contrat terminé (Arrêté), n'est
 *   équipé par personne : on ne sait pas qui l'équipe aujourd'hui. Le concurrent
 *   d'avant reste sur la fiche, il ne compte plus.
 * - Sinon (prospect, en pause), le concurrent en place, s'il y en a un.
 */
export type OrganisationConcurrent = {
  etape: CrmEtapeCommerciale;
  concurrentId: number | null;
  concurrentGagnantId: number | null;
};

/** Perdu sans gagnant, ou contrat terminé : qui l'équipe aujourd'hui n'est pas connu. */
const equipementInconnu = (etape: CrmEtapeCommerciale) => etape === "PERDU" || etape === "POC_NON_TRANSFORME" || etape === "ARRETE";

export function concurrentEffectif(org: OrganisationConcurrent): number | null {
  if (org.concurrentGagnantId !== null) return org.concurrentGagnantId;
  if (estClient(org.etape) || equipementInconnu(org.etape)) return null;
  return org.concurrentId;
}

/**
 * Ce qu'un établissement est pour un concurrent donné, sans double compte :
 * - « perdue » : une affaire perdue contre lui (il en est le gagnant) ; elle ne
 *   compte pas aussi parmi les établissements en place, même s'il y était déjà.
 * - « en_place » : il l'équipe (`concurrentEffectif`), hors affaire perdue.
 * - « passe_chez_lyrae » : la fiche le désigne encore, mais l'établissement est
 *   devenu client de Lyrae.
 * - null : rien à voir avec lui, y compris un établissement qui le désignait
 *   mais qu'un autre concurrent a gagné, un dossier perdu sans gagnant et un
 *   contrat terminé.
 */
export type LienConcurrent = "en_place" | "perdue" | "passe_chez_lyrae";

export function lienAvecConcurrent(org: OrganisationConcurrent, concurrentId: number): LienConcurrent | null {
  if (org.concurrentGagnantId === concurrentId) return "perdue";
  if (org.concurrentGagnantId !== null) return null;
  if (org.concurrentId !== concurrentId) return null;
  if (estClient(org.etape)) return "passe_chez_lyrae";
  return concurrentEffectif(org) === concurrentId ? "en_place" : null;
}

/** Les comptes de la liste des concurrents, par concurrent, en une passe sur les organisations liées. */
export function compterParConcurrent(organisations: readonly OrganisationConcurrent[]): Map<number, { enPlace: number; perdues: number }> {
  const comptes = new Map<number, { enPlace: number; perdues: number }>();
  const compte = (id: number) => {
    let c = comptes.get(id);
    if (!c) comptes.set(id, c = { enPlace: 0, perdues: 0 });
    return c;
  };
  for (const o of organisations) {
    const id = concurrentEffectif(o);
    if (id === null) continue;
    const lien = lienAvecConcurrent(o, id);
    if (lien === "perdue") compte(id).perdues += 1;
    else if (lien === "en_place") compte(id).enPlace += 1;
  }
  return comptes;
}

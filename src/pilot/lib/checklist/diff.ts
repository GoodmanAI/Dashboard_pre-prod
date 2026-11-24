import type { CrmCleEtape, CrmEtapeIntegration } from "@prisma/client";
import type { EtatComplétude } from "@/pilot/lib/completude/adapter";
import type { DefinitionEtape } from "./definition";

export const SANS_COMPTE = "Aucun UserProduct au Dashboard pour ce centre";
type Verdict = { faite: boolean; motif?: string };

/** Ce que Pilot sait seul, sans le Dashboard (lot V, C-85). */
export type FaitsPilot = { contactFacturation: boolean; chefDeProjet: boolean };
export const SANS_FAITS_PILOT: FaitsPilot = { contactFacturation: false, chefDeProjet: false };
export const MOTIF_SANS_FACTURATION = "Aucun contact marqué « facturation » sur la fiche du compte";
export const MOTIF_SANS_CHEF = "Aucun chef de projet désigné sur la fiche du compte";
/** Au-delà, une mise en service n'appelle plus de suivi ni de top facturation. */
export const JOURS_SUIVI_APRES_SERVICE = 30;

/** Les étapes que Pilot constate depuis ses propres fiches : le compte Dashboard n'y change rien. */
export function verdictPilot(cle: CrmCleEtape, faits: FaitsPilot): Verdict | null {
  switch (cle) {
    case "CONTACTS_FACTURATION": return faits.contactFacturation ? { faite: true } : { faite: false, motif: MOTIF_SANS_FACTURATION };
    case "RESPONSABLE_DESIGNE": return faits.chefDeProjet ? { faite: true } : { faite: false, motif: MOTIF_SANS_CHEF };
    default: return null;
  }
}

/**
 * Une étape du lot V n'arrive pas chez un déploiement déjà en service (C-85).
 * Celles qui partent de la mise en service (top facturation, suivi) arrivent
 * encore si elle date de moins de 30 jours. La mise en service est lue sur la
 * case PASSAGE_PRODUCTION : c'est elle qui fait foi, même après une reprise.
 */
export function creationDifferee(def: DefinitionEtape, existantes: CrmEtapeIntegration[], maintenant: Date): boolean {
  if (!def.lotV) return false;
  const passage = existantes.find((e) => e.cle === "PASSAGE_PRODUCTION");
  if (!passage?.faite) return false;
  if (def.depart !== "MISE_EN_SERVICE" || !passage.faiteLe) return true;
  return maintenant.getTime() - passage.faiteLe.getTime() >= JOURS_SUIVI_APRES_SERVICE * 86400000;
}

/** Projection du verdict du registre. Aucun calcul de complétude ici. */
export function verdictAutomatique(cle: CrmCleEtape, etat: EtatComplétude): Verdict | null {
  switch (cle) {
    case "JETON_XPLORE": return { faite: etat.jetonXploreValide, motif: etat.motifs.jetonXploreValide };
    case "CODE_CENTRE": return { faite: etat.codeCentreRattache, motif: etat.motifs.codeCentreRattache };
    case "MAPPING_EXAMENS": return { faite: etat.mappingExamensTermine, motif: etat.motifs.mappingExamensTermine };
    case "REGLAGES_ROBOT": return { faite: etat.reglagesRobotValides, motif: etat.motifs.reglagesRobotValides };
    case "PREMIER_APPEL_REEL": return { faite: etat.premierAppelReel, motif: etat.motifs.premierAppelReel };
    case "INTERFACAGE_TELEPHONIQUE": return etat.numeroPose ? null : { faite: false, motif: etat.motifs.numeroPose };
    default: return null;
  }
}

export type Creation = Pick<CrmEtapeIntegration, "cle" | "mode" | "faite" | "faiteLe" | "motif" | "evalueeLe">;
export type MiseAJour = {
  existante: CrmEtapeIntegration;
  data: { motif: string | null; evalueeLe: Date; faite?: boolean; faiteLe?: Date | null; auteurId?: null };
};
export type Regression = {
  id: number; avant: { faite: true; faiteLe: Date | null }; apres: { faite: false; motif: string | null };
};

/** Pure : les champs humains ne figurent jamais dans une écriture automatique. */
export function diffEtapes({ definitions, etat, existantes, maintenant, faitsPilot = SANS_FAITS_PILOT }: {
  definitions: DefinitionEtape[]; etat: EtatComplétude | null;
  existantes: CrmEtapeIntegration[]; maintenant: Date; faitsPilot?: FaitsPilot;
}) {
  const creations: Creation[] = [];
  const misesAJour: MiseAJour[] = [];
  const regressions: Regression[] = [];
  const inchangees: number[] = [];
  const parCle = new Map(existantes.map((e) => [e.cle, e]));
  for (const def of definitions) {
    const ligne = parCle.get(def.cle);
    if (!ligne && creationDifferee(def, existantes, maintenant)) continue;
    if (def.mode === "MANUEL") {
      if (!ligne) creations.push({ cle: def.cle, mode: def.mode, faite: false, faiteLe: null, motif: null, evalueeLe: null });
      continue;
    }
    const verdict = verdictPilot(def.cle, faitsPilot)
      ?? (etat === null ? { faite: false, motif: SANS_COMPTE } : verdictAutomatique(def.cle, etat));
    const motif = verdict?.motif ?? null;
    const faite = def.mode === "AUTOMATIQUE" ? verdict?.faite ?? false : ligne?.faite ?? false;
    if (!ligne) {
      creations.push({ cle: def.cle, mode: def.mode, faite, faiteLe: faite ? maintenant : null, motif, evalueeLe: maintenant });
    } else if (ligne.mode === def.mode) {
      // Une ancienne ligne MANUEL ne peut jamais être réécrite par l'évaluateur.
      if (ligne.faite === faite && ligne.motif === motif) inchangees.push(ligne.id);
      else {
        misesAJour.push({ existante: ligne, data: {
          motif, evalueeLe: maintenant,
          ...(def.mode === "AUTOMATIQUE" ? { faite, faiteLe: faite ? (ligne.faite ? ligne.faiteLe ?? maintenant : maintenant) : null, auteurId: null } : {}),
        } });
        if (def.mode === "AUTOMATIQUE" && ligne.faite && !faite) {
          regressions.push({ id: ligne.id, avant: { faite: true, faiteLe: ligne.faiteLe }, apres: { faite: false, motif } });
        }
      }
    }
  }
  return { creations, misesAJour, regressions, inchangees };
}

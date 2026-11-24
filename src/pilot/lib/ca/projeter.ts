import { pondere } from "@/pilot/lib/argent";
import { ajouterMois } from "@/pilot/lib/contrats/regles";
import { PROBABILITE_PAR_ETAPE } from "@/pilot/lib/pipeline";
import type { FormationCa } from "@/pilot/lib/facturation/calendrier";

export type ContratProjection = {
  statut: "BROUILLON" | "ACTIF" | "TERMINE";
  debuteLe: Date | null; signeLe: Date | null; termineLe: Date | null;
  /**
   * Montants nets du contrat (C-39) : une ligne offerte y vaut 0 et ne change
   * aucun total. PRESTATION (lot S) compte une fois, au début, comme MISE_EN_SERVICE.
   */
  lignes: Array<{ id: number; type: "ABONNEMENT" | "MISE_EN_SERVICE" | "PART_VARIABLE" | "PRESTATION"; montantCentimes: number }>;
};
export type OpportuniteProjection = {
  id: number; etape: keyof typeof PROBABILITE_PAR_ETAPE;
  montantMensuelCentimes: number; montantMiseEnServiceCentimes: number;
  probabilite: number; probabiliteForcee: boolean;
  categoriePrevision: "ENGAGE" | "PROBABLE" | "POSSIBLE" | "EXCLU";
  demarrageAttenduLe: Date | null; gagneeLe: Date | null; perdueLe: Date | null;
};
/** `miseEnService` : ce qui se facture une fois ce mois-là, installations et prestations (lot S). */
export type MoisProjete = { mois: Date; signe: number; variable: number; miseEnService: number; pondere: number; optimiste: number };
/** Une ligne facturée une fois, au mois du début officiel du contrat (C-45) : installation ou prestation (lot S). */
export const factureeUneFois = (type: ContratProjection["lignes"][number]["type"]) => type === "MISE_EN_SERVICE" || type === "PRESTATION";
export type ScenarioProjection = { cochees: Set<number>; decalages: Map<number, Date> };

export function decalerMois(date: Date, n: number): Date {
  const mois = new Date(date);
  mois.setUTCDate(1);
  mois.setUTCHours(0, 0, 0, 0);
  return ajouterMois(mois, n);
}
export function moisSuivants(depart: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, index) => decalerMois(depart, index));
}
type DatesContrat = Pick<ContratProjection, "statut" | "debuteLe" | "signeLe" | "termineLe">;
/** Début d'un contrat : `debuteLe`, sinon `signeLe` (C-45). */
export function debutContrat(c: DatesContrat): Date | null {
  return c.debuteLe ?? c.signeLe;
}
/**
 * Règles de comptage communes à la projection et au réel figé (C-45), pour
 * qu'un mois projeté et un mois figé ne divergent jamais : tout se compare au
 * mois UTC, un brouillon ne compte jamais, un contrat sans début non plus, un
 * contrat terminé compte jusqu'au mois de sa fin.
 */
export function contratCompteLeMois(c: DatesContrat, mois: Date): boolean {
  const debut = debutContrat(c);
  const m = decalerMois(mois, 0);
  return c.statut !== "BROUILLON" && debut !== null && decalerMois(debut, 0) <= m &&
    (c.termineLe === null || decalerMois(c.termineLe, 0) >= m);
}
export function projeter(p: {
  contrats: ContratProjection[]; opportunites: OpportuniteProjection[];
  formations?: FormationCa[];
  scenario: ScenarioProjection | null; variableMensuelleParLigne: Map<number, number>;
  moisDepart: Date; nbMois: number;
}): MoisProjete[] {
  return moisSuivants(p.moisDepart, p.nbMois).map((mois) => {
    let recurrent = 0, variable = 0, miseEnService = 0;
    for (const c of p.contrats) {
      if (!contratCompteLeMois(c, mois)) continue;
      const debut = debutContrat(c)!;
      for (const ligne of c.lignes) {
        if (ligne.type === "ABONNEMENT") recurrent += ligne.montantCentimes;
        if (ligne.type === "PART_VARIABLE") variable += p.variableMensuelleParLigne.get(ligne.id) ?? 0;
        if (factureeUneFois(ligne.type) && +decalerMois(debut, 0) === +mois) miseEnService += ligne.montantCentimes;
      }
    }
    for (const f of p.formations ?? []) if (+decalerMois(f.debuteLe, 0) === +mois) miseEnService += f.montantCentimes ?? 0;
    const signe = recurrent + variable + miseEnService;
    let montantPondere = signe, optimiste = signe;
    for (const o of p.opportunites) {
      if (o.gagneeLe || o.perdueLe || o.categoriePrevision === "EXCLU" || (p.scenario && !p.scenario.cochees.has(o.id))) continue;
      const debut = p.scenario?.decalages.get(o.id) ?? o.demarrageAttenduLe;
      if (!debut || decalerMois(debut, 0) > mois) continue;
      const montant = o.montantMensuelCentimes + (+decalerMois(debut, 0) === +mois ? o.montantMiseEnServiceCentimes : 0);
      // Un seul arrondi sur la contribution de cette opportunité à ce mois.
      montantPondere += pondere(montant, o.probabiliteForcee ? o.probabilite : PROBABILITE_PAR_ETAPE[o.etape]);
      optimiste += montant;
    }
    return { mois, signe, variable, miseEnService, pondere: montantPondere, optimiste };
  });
}
/** Le premier mois est le mois de départ, fourni explicitement par l'appelant. */
export function resumeProjection(mois: MoisProjete[]) {
  const courant = mois[0];
  return {
    recurrentSigne: courant ? courant.signe - courant.variable - courant.miseEnService : 0,
    miseEnService: courant?.miseEnService ?? 0, variable: courant?.variable ?? 0,
    ecartPondere: courant ? courant.pondere - courant.signe : 0,
  };
}

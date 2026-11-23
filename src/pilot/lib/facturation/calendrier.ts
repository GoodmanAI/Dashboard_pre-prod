import { ajouterMois } from "@/pilot/lib/contrats/regles";
import { contratCompteLeMois, decalerMois, debutContrat, moisSuivants, projeter, type ContratProjection } from "@/pilot/lib/ca/projeter";
import { dansJours } from "@/pilot/lib/dates";
import { formationARattraper } from "./rattrapage";

export type CycleFacturation = { id: string; debuteLe: Date; prolongeLe: Date | null; issue?: string };
export type FormationFacturation = { cycleId: string; debuteLe: Date; montantCentimes: number | null;
  grilleId: number | null; factureEmiseLe: Date | null; comptabiliseeLe: Date | null };
export type FormationCa = Pick<FormationFacturation, "debuteLe" | "montantCentimes">;

/** Le courant peut aussi figurer dans l'archive C-94. */
export function cyclesUniques(cycles: CycleFacturation[]): CycleFacturation[] {
  return [...new Map(cycles.map((c) => [c.id, c])).values()].sort((a, b) => +a.debuteLe - +b.debuteLe || a.id.localeCompare(b.id));
}
export const premierPoc = (cycles: CycleFacturation[]) => cyclesUniques(cycles)[0] ?? null;

/** Le rôle impose une prestation par dossier. Aucun prix de repli. */
export function prixFormation(g: { id: number | null; tarifs: Array<{ code: string; type: string; base: string; montantHtCentimes: number | null }> }) {
  const t = g.tarifs.find((t) => t.code === "FORMATION_POC" && t.type === "PRESTATION" && t.base === "PAR_ORGANISATION");
  return { grilleId: g.id, montantCentimes: t?.montantHtCentimes ?? null };
}

/** Le marqueur est écrit uniquement avec l'insertion d'une nouvelle clé figée. */
export function regularisationFormation(f: FormationFacturation, cleExiste: boolean): boolean {
  return cleExiste && f.comptabiliseeLe === null && f.montantCentimes !== null;
}
export type LigneCalendrier = { type: "FORMATION" | "FORMATION_DEJA_DUE" | "GRATUIT" | "PROLONGATION" | "PAYANT";
  debuteLe: Date; termineLe: Date | null; montantCentimes: number; prixARenseigner: boolean; regularisation: boolean; rattrapage: boolean };
export type MoisCalendrier = { mois: Date; montantCentimes: number; lignes: LigneCalendrier[] };

/** Même règle mensuelle C-45 que le CA. Les périodes peuvent coexister dans un mois. */
export function calendrierFacturation(p: { cycles: CycleFacturation[]; formation: FormationFacturation | null;
  contrats: ContratProjection[]; moisDepart: Date; nbMois: number; maintenant: Date; cleFormationDejaFigee?: boolean }): MoisCalendrier[] {
  const cycles = cyclesUniques(p.cycles);
  return moisSuivants(p.moisDepart, p.nbMois).map((mois) => {
    const finMois = decalerMois(mois, 1);
    const lignes: LigneCalendrier[] = [];
    const ajouter = (type: LigneCalendrier["type"], debuteLe: Date, termineLe: Date | null, montantCentimes = 0, prixARenseigner = false, regularisation = false, rattrapage = false) => {
      lignes.push({ type, debuteLe, termineLe, montantCentimes, prixARenseigner, regularisation, rattrapage });
    };
    const f = p.formation;
    if (f && +decalerMois(f.debuteLe, 0) === +mois) ajouter("FORMATION", f.debuteLe, f.debuteLe, f.montantCentimes ?? 0,
      f.montantCentimes === null, regularisationFormation(f, p.cleFormationDejaFigee ?? false),
      formationARattraper(f, p.cleFormationDejaFigee ?? false, p.maintenant));
    for (const c of cycles) {
      if (f && c.id !== f.cycleId && +decalerMois(c.debuteLe, 0) === +mois) ajouter("FORMATION_DEJA_DUE", f.debuteLe, f.debuteLe);
      const finGratuit = ajouterMois(c.debuteLe, 1);
      if (c.debuteLe < finMois && finGratuit > mois) ajouter("GRATUIT", c.debuteLe, dansJours(finGratuit, -1));
      const finProlongation = ajouterMois(c.debuteLe, 2);
      if (c.prolongeLe && finGratuit < finMois && finProlongation > mois) ajouter("PROLONGATION", finGratuit, dansJours(finProlongation, -1));
    }
    for (const c of p.contrats) {
      if (!contratCompteLeMois(c, mois)) continue;
      const montant = projeter({ contrats: [c], opportunites: [], scenario: null, variableMensuelleParLigne: new Map(), moisDepart: mois, nbMois: 1 })[0].signe;
      ajouter("PAYANT", debutContrat(c)!, c.termineLe, montant);
    }
    return { mois, montantCentimes: lignes.reduce((s, l) => s + l.montantCentimes, 0), lignes };
  });
}

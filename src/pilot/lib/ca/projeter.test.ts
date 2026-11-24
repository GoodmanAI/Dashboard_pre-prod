import { describe, expect, it } from "vitest";
import { contratCompteLeMois, debutContrat, decalerMois, moisSuivants, projeter, resumeProjection, type ContratProjection, type OpportuniteProjection } from "./projeter";

const date = (s: string) => new Date(s);
const contrat: ContratProjection = { statut: "ACTIF", debuteLe: date("2026-11-20"), signeLe: date("2026-10-15"), termineLe: null,
  lignes: [{ id: 1, type: "ABONNEMENT", montantCentimes: 101 }, { id: 2, type: "MISE_EN_SERVICE", montantCentimes: 203 }, { id: 3, type: "PART_VARIABLE", montantCentimes: 9 }] };
const opportunite: OpportuniteProjection = { id: 4, etape: "PROPOSITION", montantMensuelCentimes: 101, montantMiseEnServiceCentimes: 101,
  probabilite: 33, probabiliteForcee: true, categoriePrevision: "PROBABLE", demarrageAttenduLe: date("2026-11-28"), gagneeLe: null, perdueLe: null };
function calcul(p: Partial<Parameters<typeof projeter>[0]> = {}) {
  return projeter({ contrats: [], opportunites: [], scenario: null, variableMensuelleParLigne: new Map(), moisDepart: date("2026-10-27"), nbMois: 4, ...p });
}
describe("projection mensuelle en centimes", () => {
  it("compte tout le mois de début, et une seule mise en service", () => {
    expect(calcul({ contrats: [contrat] }).map((m) => [m.signe, m.miseEnService])).toEqual([[0,0],[304,203],[101,0],[101,0]]);
  });
  it("inclut le mois de fin d'un contrat terminé", () => {
    expect(calcul({ contrats: [{ ...contrat, statut: "TERMINE", termineLe: date("2026-12-10") }] }).map((m) => m.signe)).toEqual([0,304,101,0]);
  });
  it("respecte aussi une fin renseignée sur un actif", () => {
    expect(calcul({ contrats: [{ ...contrat, termineLe: date("2026-11-10") }] }).map((m) => m.signe)).toEqual([0,304,0,0]);
  });
  it("ignore les brouillons et les contrats sans aucune date", () => {
    expect(calcul({ contrats: [{ ...contrat, statut: "BROUILLON" }, { ...contrat, debuteLe: null, signeLe: null }] }).every((m) => m.signe === 0)).toBe(true);
  });
  it("utilise la signature en l'absence de début et suppose la reconduction", () => {
    expect(calcul({ contrats: [{ ...contrat, debuteLe: null }] }).map((m) => m.signe)).toEqual([304,101,101,101]);
  });
  it("lit la variable dans la carte, jamais dans le tarif unitaire", () => {
    const resultat = calcul({ contrats: [contrat], variableMensuelleParLigne: new Map([[3, 37]]) });
    expect(resultat.map((m) => m.variable)).toEqual([0,37,37,37]);
    expect(resultat[1].signe).toBe(341);
    expect(calcul({ contrats: [contrat] })[1].variable).toBe(0);
  });
  it("compte par défaut et arrondit une seule fois par opportunité et mois", () => {
    const resultat = calcul({ opportunites: [opportunite] });
    expect(resultat.map((m) => m.pondere)).toEqual([0,67,33,33]);
    expect(resultat.map((m) => m.optimiste)).toEqual([0,202,101,101]);
  });
  it("arrondit chaque opportunité avant de sommer", () => {
    expect(calcul({ opportunites: [opportunite, { ...opportunite, id: 5 }] })[2].pondere).toBe(66);
  });
  it("coche et décoche explicitement", () => {
    for (const cochee of [true, false]) expect(calcul({ opportunites: [opportunite], scenario: { cochees: new Set(cochee ? [4] : []), decalages: new Map() } })[1].pondere).toBe(cochee ? 67 : 0);
  });
  it("décale le démarrage et la mise en service au même mois", () => {
    expect(calcul({ opportunites: [opportunite], scenario: { cochees: new Set([4]), decalages: new Map([[4,date("2027-01-14")]]) } }).map((m) => m.optimiste)).toEqual([0,0,0,202]);
  });
  it("exclut les opportunités sans date, EXCLU, gagnées et perdues", () => {
    for (const champs of [{ demarrageAttenduLe: null }, { categoriePrevision: "EXCLU" as const }, { gagneeLe: date("2026-10-01") }, { perdueLe: date("2026-10-01") }]) {
      expect(calcul({ opportunites: [{ ...opportunite, ...champs }] }).every((m) => m.optimiste === 0)).toBe(true);
    }
  });
  it("prend la probabilité de l'étape quand elle n'est pas forcée", () => {
    expect(calcul({ opportunites: [{ ...opportunite, probabiliteForcee: false }] })[2].pondere).toBe(66);
  });
  it("ajoute les opportunités au signé sans altérer ses composantes", () => {
    expect(calcul({ contrats: [contrat], opportunites: [opportunite] })[1]).toEqual({ mois: date("2026-11-01"), signe:304, variable:0, miseEnService:203, pondere:371, optimiste:506 });
  });
  it("produit 24 premiers du mois UTC sans modifier les entrées", () => {
    const depart = date("2026-12-31T23:30:00Z");
    const mois = moisSuivants(depart,24);
    expect(mois).toHaveLength(24); expect(mois[1]).toEqual(date("2027-01-01")); expect(mois[23]).toEqual(date("2028-11-01"));
    expect(decalerMois(depart,-10)).toEqual(date("2026-02-01")); expect(depart.toISOString()).toBe("2026-12-31T23:30:00.000Z");
    expect(moisSuivants(depart,0)).toEqual([]);
  });
  it("résume le premier mois sans confondre signé et récurrent", () => {
    expect(resumeProjection(calcul({ contrats: [{ ...contrat, debuteLe: null }], variableMensuelleParLigne: new Map([[3,37]]) }))).toEqual({ recurrentSigne:101, variable:37, miseEnService:203, ecartPondere:0 });
    expect(resumeProjection([])).toEqual({ recurrentSigne:0, variable:0, miseEnService:0, ecartPondere:0 });
  });
});
describe("contratCompteLeMois, règle commune à la projection et au réel", () => {
  const nov = date("2026-11-01"), dec = date("2026-12-01"), oct = date("2026-10-01");
  it("compte du mois de début au mois de fin compris, au mois UTC", () => {
    const c = { statut: "TERMINE" as const, debuteLe: date("2026-11-20"), signeLe: null, termineLe: date("2026-12-10") };
    expect([oct, nov, dec, date("2027-01-01")].map((m) => contratCompteLeMois(c, m))).toEqual([false, true, true, false]);
    expect(contratCompteLeMois(c, date("2026-11-30T23:59:59Z"))).toBe(true);
  });
  it("prend la signature sans début, ignore brouillons et contrats sans date", () => {
    expect(contratCompteLeMois({ statut: "ACTIF", debuteLe: null, signeLe: date("2026-10-15"), termineLe: null }, oct)).toBe(true);
    expect(debutContrat({ statut: "ACTIF", debuteLe: null, signeLe: date("2026-10-15"), termineLe: null })).toEqual(date("2026-10-15"));
    expect(contratCompteLeMois({ statut: "BROUILLON", debuteLe: oct, signeLe: oct, termineLe: null }, nov)).toBe(false);
    expect(contratCompteLeMois({ statut: "ACTIF", debuteLe: null, signeLe: null, termineLe: null }, nov)).toBe(false);
  });
  it("donne à projeter exactement les mois que la règle compte", () => {
    const c = { ...contrat, statut: "TERMINE" as const, termineLe: date("2026-12-10") };
    const mois = moisSuivants(oct, 4);
    expect(calcul({ contrats: [c] }).map((m) => m.signe > 0)).toEqual(mois.map((m) => contratCompteLeMois(c, m)));
  });
});
describe("prestation (lot S) : comptée une fois, au début officiel, comme une mise en service", () => {
  const avecPrestation: ContratProjection = { statut: "ACTIF", debuteLe: date("2026-11-20"), signeLe: date("2026-10-15"), termineLe: null,
    lignes: [{ id: 1, type: "ABONNEMENT", montantCentimes: 101 }, { id: 5, type: "PRESTATION", montantCentimes: 50000 }] };
  it("au mois du début, pas les mois suivants, dans les montants « une fois »", () => {
    expect(calcul({ contrats: [avecPrestation] }).map((m) => [m.signe, m.miseEnService])).toEqual([[0, 0], [50101, 50000], [101, 0], [101, 0]]);
  });
  it("sans début officiel, au mois de la signature ; sans l'un ni l'autre, jamais", () => {
    expect(calcul({ contrats: [{ ...avecPrestation, debuteLe: null }] }).map((m) => m.miseEnService)).toEqual([50000, 0, 0, 0]);
    expect(calcul({ contrats: [{ ...avecPrestation, debuteLe: null, signeLe: null }] }).every((m) => m.signe === 0)).toBe(true);
  });
  it("un contrat terminé la compte à son début s'il a compté ce mois-là, jamais un brouillon", () => {
    expect(calcul({ contrats: [{ ...avecPrestation, statut: "TERMINE", termineLe: date("2026-11-25") }] }).map((m) => m.signe)).toEqual([0, 50101, 0, 0]);
    expect(calcul({ contrats: [{ ...avecPrestation, statut: "BROUILLON" }] }).every((m) => m.signe === 0)).toBe(true);
  });
  it("une ligne offerte, à 0 dans le contrat, ne change aucun total", () => {
    const offerte: ContratProjection = { ...avecPrestation, lignes: [...avecPrestation.lignes, { id: 6, type: "MISE_EN_SERVICE", montantCentimes: 0 }, { id: 7, type: "ABONNEMENT", montantCentimes: 0 }] };
    expect(calcul({ contrats: [offerte] })).toEqual(calcul({ contrats: [avecPrestation] }));
  });
  it("le résumé range la prestation avec les montants une fois, pas dans le récurrent signé", () => {
    expect(resumeProjection(calcul({ contrats: [{ ...avecPrestation, debuteLe: null }] }))).toEqual({ recurrentSigne: 101, variable: 0, miseEnService: 50000, ecartPondere: 0 });
  });
});

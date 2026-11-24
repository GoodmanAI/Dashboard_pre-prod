import { describe, expect, it } from "vitest";
import { prochaineActionDe } from "./prochaineAction";

const maintenant = new Date("2026-10-26T12:00:00Z");
const date = (jour: number) => new Date(Date.UTC(2026, 9, jour));
type Echange = Parameters<typeof prochaineActionDe>[0][number];
const e = (id: number, champs: Partial<Echange> = {}): Echange => ({
  id, type: "APPEL", statut: "REALISE", surveneuLe: date(25), prochaineAction: "Rappeler", prochaineActionLe: date(27), prochaineActionFaiteLe: null, ...champs,
});
const calcul = (echanges: Echange[]) => prochaineActionDe(echanges, maintenant);
describe("prochaine action", () => {
  it("ne trouve rien sans décision ni rendez-vous", () => {
    expect(calcul([])).toBeNull();
    expect(calcul([e(1, { prochaineAction: "   " }), e(2, { statut: "ANNULE" })])).toBeNull();
  });
  it("garde l'action seule", () => expect(calcul([e(1)])).toEqual({ texte: "Rappeler", le: date(27), echangeId: 1, nature: "action" }));
  it("nomme et date le rendez-vous", () => expect(calcul([e(1, { type: "DEMO", statut: "PLANIFIE" })])).toEqual({
    texte: "Rendez-vous : Démo", le: date(25), echangeId: 1, nature: "rendez-vous",
  }));
  it.each([26, 28])("prend le plus proche candidat (%s)", (jour) => {
    expect(calcul([e(1), e(2, { statut: "PLANIFIE", surveneuLe: date(jour) })])?.nature).toBe(jour < 27 ? "rendez-vous" : "action");
  });
  it("donne priorité à l'action à égalité", () => expect(calcul([e(1), e(2, { statut: "PLANIFIE", surveneuLe: date(27) })])?.echangeId).toBe(1));
  it("une décision faite ne ressuscite pas l'ancienne", () => expect(calcul([
    e(1, { surveneuLe: date(24) }), e(2, { prochaineActionFaiteLe: date(26) }),
  ])).toBeNull());
  it("ignore une saisie rétroactive même plus urgente", () => expect(calcul([
    e(3, { surveneuLe: date(23), prochaineActionLe: date(20) }), e(2),
  ])?.echangeId).toBe(2));
  it("départage les décisions de même date par id décroissant", () => expect(calcul([e(1), e(2)])?.echangeId).toBe(2));
  it("une action sans date reste visible seule", () => expect(calcul([e(1, { prochaineActionLe: null })])).toMatchObject({ echangeId: 1, le: null }));
  it("une action sans date cède au rendez-vous", () => expect(calcul([e(1, { prochaineActionLe: null }), e(2, { statut: "PLANIFIE", surveneuLe: date(30) })])?.nature).toBe("rendez-vous"));
  it("un rendez-vous passé reste à confirmer", () => expect(calcul([e(1, { statut: "PLANIFIE", surveneuLe: date(1) })])?.echangeId).toBe(1));
  it("une réalisation sans action ne remplace pas la dernière décision", () => expect(calcul([e(1), e(2, { surveneuLe: date(26), prochaineAction: null })])?.echangeId).toBe(1));
  it("ne modifie pas les entrées", () => {
    const entrees = [e(1), e(2)]; const avant = JSON.stringify(entrees); calcul(entrees); expect(JSON.stringify(entrees)).toBe(avant);
  });
});

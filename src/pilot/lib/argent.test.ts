import { describe, expect, it } from "vitest";
import { centimesDepuisSaisie, eurosCourts, pondere, saisieEuros } from "./argent";
describe("saisie française en centimes entiers", () => {
  it.each([["1 050,50",105050], ["1\u202f050,50",105050], ["1\u00a0050.50",105050], ["0,01",1], ["12,5",1250], ["0",0], [" 42 ",4200]])("montant %s", (s, n) => expect(centimesDepuisSaisie(s)).toBe(n));
  it.each(["", " ", "-1", "+1", "1,001", "NaN", "1e3", "1 05,50", "1,2,3", "Infinity", "9007199254740992"])("refuse le montant %s", (s) => expect(() => centimesDepuisSaisie(s)).toThrow());
  it("pondère au centime avec arrondi des demis vers le haut", () => {
    expect(pondere(1, 50)).toBe(1); expect(pondere(75000, 70)).toBe(52500); expect(pondere(120000, 45)).toBe(54000);
  });
});

describe("saisieEuros : un montant prêt à être saisi", () => {
  it.each([[0, "0,00"], [1, "0,01"], [50, "0,50"], [1250, "12,50"], [105050, "1050,50"], [100000000, "1000000,00"], [-1250, "-12,50"]])("%i centimes : %s", (n, s) =>
    expect(saisieEuros(n)).toBe(s));
  it("relu par centimesDepuisSaisie, il rend le même nombre de centimes", () => {
    for (const n of [0, 1, 99, 100, 124200, 9007199254740991]) expect(centimesDepuisSaisie(saisieEuros(n))).toBe(n);
  });
});

describe("eurosCourts : un montant court, sans décimales forcées", () => {
  it.each([[0, "0"], [1200, "12"], [1250, "12,50"], [1234, "12,34"], [1, "0,01"], [5, "0,05"], [99, "0,99"], [100, "1"],
    [123456700, "1234567"], [9007199254740900, "90071992547409"], [9007199254740991, "90071992547409,91"], [-1250, "-12,50"], [-1200, "-12"]])("%i centimes : %s", (n, s) =>
    expect(eurosCourts(n)).toBe(s));
  it("le même texte que l'ancien calcul pour des euros ronds et deux décimales significatives", () => {
    const ancien = (centimes: number) => (centimes / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false });
    for (const n of [0, 100, 1200, 50000, 123456700, 1234, 1, 99, 105051]) expect(eurosCourts(n)).toBe(ancien(n));
  });
  it("relu par centimesDepuisSaisie, il rend le même nombre de centimes", () => {
    for (const n of [0, 1, 50, 99, 100, 1250, 124200, 9007199254740991]) expect(centimesDepuisSaisie(eurosCourts(n))).toBe(n);
  });
});

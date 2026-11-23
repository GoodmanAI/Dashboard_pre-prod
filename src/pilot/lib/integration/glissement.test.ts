import { describe, expect, it } from "vitest";
import { glissement } from "./glissement";
const e = (avant: unknown, apres: unknown) => ({ avant: { datePromise: avant }, apres: { datePromise: apres } });
const calcul = (evenements: ReturnType<typeof e>[], datePromise: string | null = "2027-02-01", datePromiseInitiale: string | null = "2027-01-01") =>
  glissement({ datePromise, datePromiseInitiale, evenements });
describe("glissement", () => {
  it("première pose, effacement et repose", () => {
    expect(calcul([e(null, "2027-01-01")], "2027-01-01")).toEqual({ reports: 0, joursCumules: 0, alerte: false });
    expect(calcul([e("2027-01-01", null), e(null, "2027-01-10")], "2027-01-10").reports).toBe(1);
  });
  it("ignore les dates invalides et objets étrangers", () => {
    expect(glissement({ datePromise: null, datePromiseInitiale: null, evenements: [
      { avant: null, apres: [] }, { avant: "date", apres: {} }, e("invalide", "invalide"),
    ] })).toEqual({ reports: 0, joursCumules: 0, alerte: false });
  });
  it("repli sur le premier avant valide, sinon le premier après valide", () => {
    expect(calcul([e(null, null), e(null, "2027-01-01"), e("2027-01-10", "2027-02-01")], "2027-02-01", null).joursCumules).toBe(22);
    expect(calcul([e(null, null), e(null, "2027-01-01")], "2027-02-01", null).joursCumules).toBe(31);
  });
  it("l'initiale prime sur le journal", () => expect(calcul([e("2027-01-10", "2027-02-01")]).joursCumules).toBe(31));
  it("seuils stricts, trois reports ou 31 jours", () => {
    const journal = [e("2027-01-01", "2027-01-10"), e("2027-01-10", "2027-01-20")];
    expect(calcul(journal, "2027-01-31").alerte).toBe(false);
    expect(calcul(journal).alerte).toBe(true);
    expect(calcul([...journal, e("2027-01-20", "2027-01-26")], "2027-01-26")).toEqual({ reports: 3, joursCumules: 25, alerte: true });
  });
  it("jours civils UTC et avances négatives", () => {
    expect(calcul([], "2027-01-02T00:01:00Z", "2027-01-01T23:59:00Z").joursCumules).toBe(1);
    expect(calcul([], "2026-12-20")).toEqual({ reports: 0, joursCumules: -12, alerte: false });
    expect(calcul([], null).joursCumules).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { enSuiviRenforce, periodeSuiviRenforce, silenceRenforce } from "./suiviRenforce";

const maintenant = new Date("2026-11-10T12:00:00.000Z");
const heures = (n: number) => new Date(maintenant.getTime() - n * 3600000);
const periode = periodeSuiviRenforce(heures(72));
const calcul = (dernierAppelLe: Date | null, champs: Partial<Parameters<typeof silenceRenforce>[0]> = {}) =>
  silenceRenforce({ ...periode, dernierAppelLe, maintenant, ...champs });

describe("periodeSuiviRenforce", () => {
  it("pose la mise en production et quatorze jours à l'instant près", () => {
    expect(periodeSuiviRenforce(maintenant)).toEqual({ miseEnProductionLe: maintenant, suiviRenforceJusquAu: new Date("2026-11-24T12:00:00.000Z") });
  });
});

describe("silenceRenforce, architecture §8.7", () => {
  it.each([[23, false], [24, true], [30, true]])("dernier appel il y a %i h : actif %s", (h, actif) => {
    expect(calcul(heures(h))).toEqual({ actif, heures: h, depuisMiseEnProduction: false });
  });
  it("mise en production récente sans appel : pas encore", () => {
    const recente = periodeSuiviRenforce(heures(3));
    expect(calcul(null, recente)).toEqual({ actif: false, heures: 3, depuisMiseEnProduction: true });
    expect(calcul(null)).toEqual({ actif: true, heures: 72, depuisMiseEnProduction: true });
  });
  it("un appel antérieur à la mise en production ne compte pas", () => {
    expect(calcul(heures(200), periodeSuiviRenforce(heures(10)))).toEqual({ actif: false, heures: 10, depuisMiseEnProduction: true });
    expect(calcul(heures(200), periodeSuiviRenforce(heures(25)))).toEqual({ actif: true, heures: 25, depuisMiseEnProduction: true });
  });
  it("fin de période : l'instant de fin n'est plus suivi", () => {
    const debut = heures(14 * 24);
    const fin = periodeSuiviRenforce(debut);
    expect(calcul(null, fin)).toEqual({ actif: false, heures: null, depuisMiseEnProduction: false });
    expect(calcul(null, { ...fin, maintenant: new Date(maintenant.getTime() - 1) }).actif).toBe(true);
    expect(enSuiviRenforce(fin.suiviRenforceJusquAu, maintenant)).toBe(false);
    expect(enSuiviRenforce(fin.suiviRenforceJusquAu, new Date(maintenant.getTime() - 1))).toBe(true);
  });
  it("sans mise en production ni fin de suivi : rien", () => {
    expect(calcul(null, { miseEnProductionLe: null })).toEqual({ actif: false, heures: null, depuisMiseEnProduction: false });
    expect(calcul(null, { suiviRenforceJusquAu: null })).toEqual({ actif: false, heures: null, depuisMiseEnProduction: false });
    expect(enSuiviRenforce(null, maintenant)).toBe(false);
  });
});

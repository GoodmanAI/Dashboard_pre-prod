import { describe, expect, it } from "vitest";
import { CRITERES_QUALIFICATION } from "./qualification";
import { CASES_DU_BAREME, temperature, type EntreeTemperature } from "./temperature";

const vide: EntreeTemperature = {
  etape: "PROSPECT", nombreSalles: null, nombreIrm: null, nombreScanners: null, nombreRadio: null, nombreEcho: null, nombreMammo: null, ris: null, centres: [], contacts: [], qualifBudget: false, qualifBesoin: false,
  decisionAttendueLe: null, temperatureForcee: null, temperatureForceeParId: null, temperatureForceeLe: null,
};
const maintenant = new Date("2026-11-18T00:00:00Z");
/** Les anciennes colonnes restent dans la ligne lue en base : on les passe pour prouver qu'elles ne comptent pas. */
const total = (champs: Record<string, unknown>) => temperature({ ...vide, ...champs } as EntreeTemperature, maintenant).points.total;

describe("cases de qualification", () => {
  it("ne saisit plus « Décideur rencontré » ni « Calendrier connu » : le barème lit les contacts et la date", () => {
    expect(Object.keys(CRITERES_QUALIFICATION)).toEqual(["qualifBesoin", "qualifBudget", "qualifSolutionActuelle"]);
  });
  it("partage ses libellés avec le barème", () => {
    expect(CRITERES_QUALIFICATION.qualifBesoin).toBe(CASES_DU_BAREME.qualifBesoin);
    expect(CRITERES_QUALIFICATION.qualifBudget).toBe(CASES_DU_BAREME.qualifBudget);
  });
  it("chaque case du barème donne des points", () => {
    for (const cle of Object.keys(CASES_DU_BAREME)) expect(total({ [cle]: true }), cle).toBeGreaterThan(0);
    expect(total({ qualifBesoin: true })).toBe(1);
    expect(total({ qualifBudget: true })).toBe(2);
  });
  it("la solution actuelle, et les cases Décideur et Calendrier gardées en base, ne donnent aucun point", () => {
    expect(total({ qualifSolutionActuelle: true })).toBe(0);
    expect(total({ qualifDecideur: true })).toBe(0);
    expect(total({ qualifCalendrier: true })).toBe(0);
    expect(total({ qualifSolutionActuelle: true, qualifDecideur: true, qualifCalendrier: true })).toBe(0);
  });
  it("chaque case saisie donne des points si elle est au barème, aucun sinon : rien n'est oublié", () => {
    for (const cle of Object.keys(CRITERES_QUALIFICATION)) {
      expect(total({ [cle]: true }) > 0, cle).toBe(cle in CASES_DU_BAREME);
    }
  });
  it("cocher toutes les cases ne donne que les points du barème (Besoin 1, Budget 2)", () => {
    const toutes = Object.fromEntries(Object.keys(CRITERES_QUALIFICATION).map((cle) => [cle, true]));
    expect(total({ ...toutes, qualifDecideur: true, qualifCalendrier: true })).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { joursDansEtape, vieillissement } from "./pipeline";

const maintenant = new Date("2026-10-26T12:00:00Z");
const depuis = (jours: number) => new Date(maintenant.getTime() - jours * 86400000);
describe("vieillissement", () => {
  it("compte les jours complets et borne une date future à zéro", () => {
    expect(joursDansEtape(depuis(12.8), maintenant)).toBe(12);
    expect(joursDansEtape(depuis(-1), maintenant)).toBe(0);
  });
  it.each([["PROSPECT", 21], ["POURPARLERS", 30], ["VISIO_TECHNIQUE", 21], ["PROPOSITION", 30], ["SIGNE", 14], ["EN_INTEGRATION", 90]] as const)(
    "%s franchit son seuil après %s jours", (etape, seuil) => {
      expect(vieillissement(etape, depuis(seuil), maintenant)).toEqual({ jours: seuil, seuil, depasse: false });
      expect(vieillissement(etape, depuis(seuil + 1), maintenant)).toEqual({ jours: seuil + 1, seuil, depasse: true });
    });
  it.each(["EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL"] as const)("aucun seuil en %s", (etape) =>
    expect(vieillissement(etape, depuis(1000), maintenant)).toEqual({ jours: 1000, seuil: null, depasse: false }));
});

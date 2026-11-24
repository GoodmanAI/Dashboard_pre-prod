import { describe, expect, it } from "vitest";
import { formationARattraper, selectionnerFormationsARattraper } from "./rattrapage";
const d = (s: string) => new Date(s + "T00:00:00Z");
const maintenant = d("2027-01-10");
const formation = { organisationId: 1, debuteLe: d("2026-10-15"), montantCentimes: 12345, comptabiliseeLe: null, cleExiste: false };
describe("Sélection pure des formations à rattraper", () => {
  it("sélectionne un prix connu tardif d'un mois terminé, à son mois d'origine", () => {
    expect(selectionnerFormationsARattraper([formation], maintenant)).toEqual([{ organisationId: 1, cle: "2026-10|1|0|0", mois: d("2026-10-01"), montantCentimes: 12345 }]);
  });
  it("une clé existante reste à régulariser, jamais à réécrire", () => expect(selectionnerFormationsARattraper([{ ...formation, cleExiste: true }], maintenant)).toEqual([]));
  it("ne sélectionne ni prix inconnu, ni formation déjà comptabilisée", () => {
    expect(selectionnerFormationsARattraper([{ ...formation, montantCentimes: null }, { ...formation, comptabiliseeLe: maintenant }], maintenant)).toEqual([]);
  });
  it("ni mois courant ni mois futur", () => {
    expect(selectionnerFormationsARattraper(["2027-01-01", "2027-02-01"].map((s) => ({ ...formation, debuteLe: d(s) })), maintenant)).toEqual([]);
  });
  it("mois terminé au premier instant UTC du mois suivant", () => {
    const f = { ...formation, debuteLe: d("2026-12-31") };
    expect(formationARattraper(f, false, d("2027-01-01"))).toBe(true);
    expect(formationARattraper(f, false, new Date("2026-12-31T23:59:59.999Z"))).toBe(false);
  });
  it("un prix explicitement nul est connu et comptabilisable", () => expect(selectionnerFormationsARattraper([{ ...formation, montantCentimes: 0 }], maintenant)[0].montantCentimes).toBe(0));
  it("conserve les centimes et les entrées, ordre stable", () => {
    const entree = [{ ...formation, organisationId: 2 }, formation]; const avant = JSON.stringify(entree);
    expect(selectionnerFormationsARattraper(entree, maintenant).map((f) => f.organisationId)).toEqual([1, 2]);
    expect(JSON.stringify(entree)).toBe(avant);
  });
});

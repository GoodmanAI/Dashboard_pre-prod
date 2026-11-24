import { describe, expect, it } from "vitest";
import { libelleSites, nombreDeSites, sitesSousLesCentres } from "./sites";

describe("nombre de sites, une seule règle (C-92)", () => {
  it("le saisi, jamais sous le nombre de centres créés", () => {
    expect(nombreDeSites(2, 1)).toBe(2);
    expect(nombreDeSites(1, 2)).toBe(2);
    expect(nombreDeSites(3, 3)).toBe(3);
  });
  it("sans saisi, les centres ; sans l'un ni l'autre, inconnu", () => {
    expect(nombreDeSites(null, 2)).toBe(2);
    expect(nombreDeSites(undefined, 0)).toBeNull();
    expect(nombreDeSites(0, 0)).toBeNull();
    expect(nombreDeSites(0, 1)).toBe(1);
  });
  it("dit pourquoi et quoi faire", () => {
    expect(sitesSousLesCentres(2)).toBe("Ce client a déjà 2 centres dans Pilot. Indiquez au moins 2 sites.");
    expect(libelleSites(null)).toBe("Sites non renseignés");
    expect(libelleSites(1)).toBe("1 site");
  });
});

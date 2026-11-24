import { describe, expect, it } from "vitest";
import { DEPARTEMENTS, LIBELLE_SANS_DEPARTEMENT, LIBELLES_DEPARTEMENT, libelleDepartement } from "./departements";

describe("départements (lot T)", () => {
  it("chaque département a son libellé, sans tiret cadratin, dans l'ordre de l'écran", () => {
    expect(DEPARTEMENTS).toEqual(["COMMERCIAL", "PROJET", "TECHNIQUE", "DIRECTION"]);
    for (const d of DEPARTEMENTS) expect(LIBELLES_DEPARTEMENT[d]).not.toMatch(/—/);
  });
  it("sans département, le libellé dit qu'il reste à choisir", () => {
    expect(libelleDepartement(null)).toBe(LIBELLE_SANS_DEPARTEMENT);
    expect(libelleDepartement(undefined)).toBe("Département pas encore choisi");
    expect(libelleDepartement("PROJET")).toBe("Projet");
  });
});

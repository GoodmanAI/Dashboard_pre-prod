import { describe, expect, it } from "vitest";
import { statutAttendu } from "./statutDashboard";

describe("statut d'un centre au Dashboard, posé par Pilot (27/11/2026)", () => {
  it("la case « Mise en service déclarée » fait la production", () => {
    expect(statutAttendu("EN_PRODUCTION", true)).toBe("production");
    expect(statutAttendu("EN_POC", true)).toBe("production");
    expect(statutAttendu("EN_INTEGRATION", false)).toBe("integration");
    expect(statutAttendu("SIGNE", false)).toBe("integration");
  });
  it("une fiche qui ne suit plus de mise en service arrête ses centres, case cochée ou non", () => {
    for (const etape of ["ARRETE", "PERDU", "EN_SOMMEIL", "POC_NON_TRANSFORME"] as const) {
      expect(statutAttendu(etape, true)).toBe("arrete");
      expect(statutAttendu(etape, false)).toBe("arrete");
    }
  });
});

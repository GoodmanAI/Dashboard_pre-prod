import { describe, expect, it } from "vitest";
import { mensuelDepuisSaisie } from "./abonnementRapide";

describe("abonnement saisi depuis la fiche", () => {
  it("un montant mensuel reste tel quel, un annuel compte au douzième", () => {
    expect(mensuelDepuisSaisie(39000, "MOIS")).toBe(39000);
    expect(mensuelDepuisSaisie(468000, "AN")).toBe(39000);
    expect(mensuelDepuisSaisie(100000, "AN")).toBe(8333);
  });
});

import { expect, it } from "vitest";
import { normaliserRequete } from "./recherche";
it("nettoie et borne la recherche, sans tronquer", () => {
  expect(normaliserRequete("  Un \t nom\n composé ")).toBe("Un nom composé");
  for (const q of ["", " ", "a", "a".repeat(81)]) expect(normaliserRequete(q)).toBe("");
  expect(normaliserRequete("ab")).toBe("ab");
  expect(normaliserRequete("a".repeat(80))).toHaveLength(80);
});

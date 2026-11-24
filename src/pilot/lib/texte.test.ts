import { expect, it } from "vitest";
import { compter } from "./texte";

it("accorde selon le nombre", () => {
  expect(compter(1, "site")).toBe("1 site");
  expect(compter(3, "site")).toBe("3 sites");
  expect(compter(0, "site")).toBe("0 site");
  expect(compter(2, "bloquante ouverte", "bloquantes ouvertes")).toBe("2 bloquantes ouvertes");
  expect(compter(0, "bloquante", "bloquantes", "Rien de bloquant")).toBe("Rien de bloquant");
});

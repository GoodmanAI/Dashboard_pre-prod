import { describe, expect, it } from "vitest";
import { refusSuppressionFiche } from "./supprimer";

const vide = { contratsSignes: 0, propositionsEnvoyees: 0, apport: false, moisFiges: 0 };
describe("supprimer une fiche créée par erreur (C-86)", () => {
  it("se supprime tant qu'aucun argent n'y est passé", () => {
    expect(refusSuppressionFiche(vide)).toBeNull();
  });
  it.each([
    [{ contratsSignes: 1 }, "contrat activé"], [{ propositionsEnvoyees: 1 }, "proposition"],
    [{ apport: true }, "apport"], [{ moisFiges: 2 }, "figé"],
  ] as const)("reste avec %o, et dit pourquoi", (traces, mot) => {
    expect(refusSuppressionFiche({ ...vide, ...traces })).toContain(mot);
  });
});

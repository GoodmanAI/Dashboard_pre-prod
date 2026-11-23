import { describe, expect, it } from "vitest";
import { eurosPrecis } from "@/pilot/lib/argent";
import { phraseBilanOpportunites } from "./regles";

describe("phraseBilanOpportunites (C-71)", () => {
  it("rien gagné, rien d'ouvert : rien à dire", () => expect(phraseBilanOpportunites({ gagnees: 0, ouvertes: [] })).toBeNull());
  it("des opportunités gagnées, aucune ouverte", () => {
    expect(phraseBilanOpportunites({ gagnees: 1, ouvertes: [] })).toBe("1 opportunité gagnée.");
    expect(phraseBilanOpportunites({ gagnees: 2, ouvertes: [] })).toBe("2 opportunités gagnées.");
  });
  it("une ouverte : son produit, son montant, et où la conclure", () => {
    expect(phraseBilanOpportunites({ gagnees: 2, ouvertes: [{ produit: "Konnect", montantMensuelCentimes: 7000 }] }))
      .toBe(`2 opportunités gagnées. Konnect (${eurosPrecis(7000)} par mois) reste ouverte : concluez-la dans Opportunités, plus bas.`);
  });
  it("plusieurs ouvertes, sans gain : la liste au pluriel", () => {
    expect(phraseBilanOpportunites({ gagnees: 0, ouvertes: [
      { produit: "Konnect", montantMensuelCentimes: 7000 }, { produit: "Desk", montantMensuelCentimes: 0 }, { produit: "Konnect", montantMensuelCentimes: 1250 },
    ] })).toBe(`Konnect (${eurosPrecis(7000)} par mois), Desk (${eurosPrecis(0)} par mois) et Konnect (${eurosPrecis(1250)} par mois) restent ouvertes : concluez-les dans Opportunités, plus bas.`);
  });
  it("aucun tiret cadratin", () => {
    expect(phraseBilanOpportunites({ gagnees: 3, ouvertes: [{ produit: "Desk", montantMensuelCentimes: 100 }] })).not.toContain("\u2014");
  });
});

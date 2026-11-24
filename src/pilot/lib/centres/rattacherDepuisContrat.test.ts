import { describe, expect, it } from "vitest";
import { phraseSansCentre, produitsARattacher } from "./rattacherDepuisContrat";
import { phraseRattachements } from "./phrases";

describe("les produits qu'un contrat signé ajoute aux centres (C-90)", () => {
  it("une ligne sur un centre rattache le produit à ce centre, une fois", () => {
    expect(produitsARattacher([{ productId: 1, centreId: 10 }, { productId: 1, centreId: 10 }, { productId: 2, centreId: 11 }], [10, 11], []))
      .toEqual({ aCreer: [{ centreId: 10, productId: 1 }, { centreId: 11, productId: 2 }], sansCentre: [] });
  });
  it("une ligne pour toute l'organisation va au centre unique", () => {
    expect(produitsARattacher([{ productId: 1, centreId: null }], [10], []).aCreer).toEqual([{ centreId: 10, productId: 1 }]);
  });
  it("avec plusieurs centres, on ne devine pas : le produit est rendu sans centre", () => {
    expect(produitsARattacher([{ productId: 1, centreId: null }], [10, 11], [])).toEqual({ aCreer: [], sansCentre: [1] });
  });
  it("un produit déjà rattaché quelque part n'est pas « sans centre », et un rattachement existant ne bouge pas", () => {
    expect(produitsARattacher([{ productId: 1, centreId: null }, { productId: 2, centreId: 10 }], [10, 11], [{ centreId: 11, productId: 1 }, { centreId: 10, productId: 2 }]))
      .toEqual({ aCreer: [], sansCentre: [] });
  });
  it("une prestation hors catalogue ne rattache rien", () => {
    expect(produitsARattacher([{ productId: null, centreId: 10 }], [10], [])).toEqual({ aCreer: [], sansCentre: [] });
  });
  it("les phrases", () => {
    expect(phraseSansCentre([])).toBeNull();
    expect(phraseSansCentre(["LyraeTalk"])).toContain("onglet Centres");
    expect(phraseRattachements(2, null)).toBe(" 2 produits ajoutés aux centres.");
    expect(phraseRattachements(0, null)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { refusRetraitProduit, refusSuppressionCentre } from "./retirer";

describe("retirer un produit ajouté par erreur (C-86)", () => {
  it("se retire tant que rien n'est fait", () => {
    expect(refusRetraitProduit({ etapesFaites: 0, miseEnProductionLe: null })).toBeNull();
  });
  it("ne se retire plus après une étape faite ou la mise en service, et dit quoi faire", () => {
    expect(refusRetraitProduit({ etapesFaites: 1, miseEnProductionLe: null })).toContain("Contrat terminé");
    expect(refusRetraitProduit({ etapesFaites: 0, miseEnProductionLe: new Date() })).toContain("déjà en service");
  });
});

describe("supprimer un centre saisi par erreur (C-86)", () => {
  it("se supprime sans produit ni ligne, s'il en reste un autre", () => {
    expect(refusSuppressionCentre({ produits: 0, lignes: 0, centresDuClient: 2 })).toBeNull();
  });
  it("jamais le dernier centre, ni un centre qui porte un produit ou une ligne", () => {
    expect(refusSuppressionCentre({ produits: 0, lignes: 0, centresDuClient: 1 })).toContain("seul centre");
    expect(refusSuppressionCentre({ produits: 1, lignes: 0, centresDuClient: 3 })).toContain("produits");
    expect(refusSuppressionCentre({ produits: 0, lignes: 2, centresDuClient: 3 })).toContain("devis ou un contrat");
  });
});

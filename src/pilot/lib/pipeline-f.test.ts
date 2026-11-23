import { describe, expect, it } from "vitest";
import { appliquerEnCours, destinationsPermises, type MouvementPipeline } from "./pipeline";
describe("destinationsPermises", () => {
  it("prospect, livraison, reconquête et sorties sans rester sur place", () => {
    expect(destinationsPermises("PROSPECT")).toEqual(["POURPARLERS", "PERDU", "EN_SOMMEIL"]);
    expect(destinationsPermises("SIGNE")).toEqual(["PROPOSITION", "EN_INTEGRATION", "PERDU", "EN_SOMMEIL"]);
    expect(destinationsPermises("PERDU")).toEqual(["PROSPECT", "EN_SOMMEIL"]);
    expect(destinationsPermises("ARRETE")).toEqual(["PROSPECT", "EN_PRODUCTION", "PERDU", "EN_SOMMEIL"]);
  });
});
describe("appliquerEnCours", () => {
  const cartes = [{ id: 1, etape: "PROSPECT", nom: "A" }, { id: 2, etape: "PROPOSITION", nom: "B" }];
  const enCours = new Map<number, MouvementPipeline>([[1, { depuis: "PROSPECT", vers: "POURPARLERS" }], [2, { depuis: "PROPOSITION", vers: "SIGNE" }]]);
  it("deux mouvements indépendants, sans mutation", () => {
    expect(appliquerEnCours(cartes, enCours).map((c) => c.etape)).toEqual(["POURPARLERS", "SIGNE"]);
    expect(cartes[0].etape).toBe("PROSPECT");
    expect(enCours.size).toBe(2);
  });
  it("refus d'une carte, l'autre continue", () => {
    const apresRefus = new Map(enCours); apresRefus.delete(1);
    expect(appliquerEnCours(cartes, apresRefus).map((c) => c.etape)).toEqual(["PROSPECT", "SIGNE"]);
  });
  it("props rafraîchies pendant une requête, nouveaux champs préservés", () => {
    const fraiches = [{ ...cartes[0], nom: "A modifié" }, cartes[1], { id: 3, etape: "PROSPECT", nom: "C" }];
    expect(appliquerEnCours(fraiches, enCours)).toEqual([
      { id: 1, etape: "POURPARLERS", nom: "A modifié" }, { ...cartes[1], etape: "SIGNE" }, fraiches[2],
    ]);
    expect(appliquerEnCours([], enCours)).toEqual([]);
  });
});

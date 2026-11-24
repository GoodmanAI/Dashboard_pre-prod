import { describe, expect, it } from "vitest";
import { repartirSalles, sallesDuDossier, valeurSalles } from "./salles";

const centres = (...salles: number[]) => salles.map((n) => ({ salles: n }));

describe("sallesDuDossier : un seul ordre, centres puis fiche puis équipements", () => {
  it("les salles saisies dans les centres d'abord, même avec un nombre sur la fiche et des équipements", () => {
    expect(sallesDuDossier({ nombreSalles: 8, nombreIrm: 6 }, centres(2, 0))).toEqual({ total: 2, source: "CENTRES", parCentre: [2, 0], reparties: false });
  });
  it("sans salle saisie, le nombre de la fiche, réparti sur les centres (le reste sur le premier)", () => {
    expect(sallesDuDossier({ nombreSalles: 8, nombreIrm: 6 }, centres(0, 0, 0))).toEqual({ total: 8, source: "FICHE", parCentre: [4, 2, 2], reparties: true });
  });
  it("le nombre de la fiche sans centre : un total, rien à répartir", () => {
    expect(sallesDuDossier({ nombreSalles: 8 }, [])).toEqual({ total: 8, source: "FICHE", parCentre: [], reparties: false });
  });
  it("sans salle saisie ni nombre de salles, les équipements : un total pour la taille, rien à facturer par centre", () => {
    expect(sallesDuDossier({ nombreSalles: 0, nombreIrm: 2, nombreScanners: 4 }, centres(0, 0))).toEqual({ total: 6, source: "EQUIPEMENTS", parCentre: [0, 0], reparties: false });
  });
  it("rien de renseigné : inconnu", () => {
    expect(sallesDuDossier({}, centres(0))).toEqual({ total: 0, source: "INCONNUE", parCentre: [0], reparties: false });
    expect(sallesDuDossier({ nombreSalles: null, nombreIrm: 0, nombreScanners: -2 }, [])).toMatchObject({ total: 0, source: "INCONNUE" });
  });
  it("une valeur négative compte pour 0, et ne masque pas la source suivante", () => {
    expect(sallesDuDossier({ nombreSalles: -3, nombreRadio: 3 }, centres(-1))).toMatchObject({ total: 3, source: "EQUIPEMENTS" });
  });
  it("concorde avec repartirSalles pour les deux premières sources", () => {
    for (const [saisies, fiche] of [[[0, 0, 0], 7], [[1, 0], 9], [[0], 2], [[0, 0], null]] as const) {
      const dossier = sallesDuDossier({ nombreSalles: fiche }, saisies.map((n) => ({ salles: n })));
      if (dossier.source === "CENTRES" || dossier.source === "FICHE") expect(dossier.parCentre).toEqual(repartirSalles(saisies, fiche).salles);
    }
  });
});

describe("valeurSalles : ce que l'écran dit avoir lu", () => {
  it("dit d'où vient le nombre", () => {
    expect(valeurSalles({ total: 2, source: "CENTRES" })).toBe("2 salles saisies dans les centres");
    expect(valeurSalles({ total: 1, source: "CENTRES" })).toBe("1 salle saisie dans les centres");
    expect(valeurSalles({ total: 8, source: "FICHE" })).toBe("8 salles déclarées sur la fiche");
    expect(valeurSalles({ total: 1, source: "FICHE" })).toBe("1 salle déclarée sur la fiche");
    expect(valeurSalles({ total: 6, source: "EQUIPEMENTS" })).toBe("6 équipements déclarés");
    expect(valeurSalles({ total: 1, source: "EQUIPEMENTS" })).toBe("1 équipement déclaré");
    expect(valeurSalles({ total: 0, source: "INCONNUE" })).toBe("Nombre de salles inconnu");
  });
});

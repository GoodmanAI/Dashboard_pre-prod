import { describe, expect, it } from "vitest";
import { familleRdv, familleRis, repartition } from "./familles";

describe("familles de RIS (C-66)", () => {
  it("ramène les écritures d'un même éditeur à une famille", () => {
    for (const v of ["Xplore", "Xplore (EDL)", "EDL Explore Rendez-vous", "Explorer EDL en cours de déploiement"]) expect(familleRis(v)).toBe("Xplore (EDL)");
    expect(familleRis("Softway (One Manager) (à confirmer)")).toBe("Softway");
    expect(familleRis("Softway Medical")).toBe("Softway");
    expect(familleRis("GXD5 (enovacom)")).toBe("Enovacom");
    expect(familleRis("Enovacom (à confirmer)")).toBe("Enovacom");
  });
  it("garde une valeur inconnue, sans sa réserve", () => {
    expect(familleRis("Autre")).toBe("Autre");
    expect(familleRis("Hexagone (à confirmer)")).toBe("Hexagone");
    expect(familleRis("  ")).toBeNull();
    expect(familleRis(null)).toBeNull();
  });
  it("plusieurs RIS l'emporte sur l'éditeur cité", () => {
    expect(familleRis("3 RIS différents (dont EDL), 3 PACS")).toBe("Plusieurs RIS");
  });
});

describe("familles de prise de RDV en ligne (C-66)", () => {
  it("lit l'outil, quelle que soit la réserve", () => {
    expect(familleRdv("Doctolib")).toBe("Doctolib");
    expect(familleRdv("Doctolib (hôpital, imagerie à confirmer)")).toBe("Doctolib");
    expect(familleRdv("Doctolib (selon les pôles)")).toBe("Doctolib");
    expect(familleRdv("EasyDoct (rdv-vidi.fr)")).toBe("EasyDoct");
    expect(familleRdv("WebBooking (Medasys), imagerie à confirmer")).toBe("WebBooking (Medasys)");
  });
  it("l'outil cité en premier l'emporte", () => {
    expect(familleRdv("Xplore Rendez-vous (EDL) et Doctolib")).toBe("Xplore Rendez-vous (EDL)");
    expect(familleRdv("Doctolib et téléphone")).toBe("Doctolib");
    expect(familleRdv("Xplore Rendez-vous (EDL) et Secrétariat externalisé")).toBe("Xplore Rendez-vous (EDL)");
  });
  it("sans outil en ligne : téléphone, formulaire ou secrétariat", () => {
    expect(familleRdv("Téléphone seul")).toBe("Téléphone seul");
    expect(familleRdv("Formulaire du site et téléphone")).toBe("Formulaire du site");
    expect(familleRdv("Secrétariat externalisé")).toBe("Secrétariat externalisé");
  });
});

it("répartit du plus fréquent au plus rare, les inconnus en dernier (C-66)", () => {
  expect(repartition(["Doctolib", null, "EasyDoct", "Doctolib", null, null])).toEqual([
    { famille: "Doctolib", nombre: 2 }, { famille: "EasyDoct", nombre: 1 }, { famille: null, nombre: 3 },
  ]);
});

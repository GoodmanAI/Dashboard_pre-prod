import { describe, expect, it } from "vitest";
import { fusionnerSuggestions, suggestionsMetier, suggestionsRdv, suggestionsRis } from "./suggestions";
import { familleRis } from "./familles";

const CODE = ["Xplore (EDL)", "Enovacom", "Aucun RIS"];

describe("fusionnerSuggestions (C-59, C-66)", () => {
  it("garde la liste du code telle quelle quand rien n'a été saisi", () => {
    expect(fusionnerSuggestions(CODE, [], familleRis)).toEqual(CODE);
  });
  it("n'ajoute pas un doublon exact", () => {
    expect(fusionnerSuggestions(CODE, ["Enovacom", "Enovacom"], familleRis)).toEqual(CODE);
  });
  it("ignore la casse et les espaces", () => {
    expect(fusionnerSuggestions(CODE, ["  enovacom ", "AUCUN   RIS"], familleRis)).toEqual(CODE);
    expect(fusionnerSuggestions(CODE, ["Hexagone", " hexagone  ", "Hexagone"], familleRis)).toEqual([...CODE, "Hexagone"]);
  });
  it("écarte les valeurs vides ou blanches", () => {
    expect(fusionnerSuggestions(CODE, ["", "   ", { valeur: null, nombre: 3 }, { valeur: " ", nombre: 2 }], familleRis)).toEqual(CODE);
  });
  it("n'ajoute rien quand la famille est déjà dans le code", () => {
    expect(fusionnerSuggestions(CODE, ["Xplore", "EDL Explore", "GXD5 (enovacom)"], familleRis)).toEqual(CODE);
  });
  it("garde une seule suggestion par famille hors du code, la plus fréquente", () => {
    expect(fusionnerSuggestions(CODE, ["Rosa", "Rosa", "Rosa", "RIS Rosa"], familleRis)).toEqual([...CODE, "Rosa"]);
  });
  it("départage à égalité par ordre alphabétique", () => {
    expect(fusionnerSuggestions(CODE, ["Rosa V2", "Rosa V1"], familleRis)).toEqual([...CODE, "Rosa V1"]);
  });
  it("compte les valeurs groupées avec leur effectif", () => {
    const r = fusionnerSuggestions(CODE, [{ valeur: "Rosa A", nombre: 1 }, { valeur: "Rosa B", nombre: 4 }], familleRis);
    expect(r).toEqual([...CODE, "Rosa B"]);
  });
  it("met le code d'abord, puis les valeurs apprises sans accents ni casse", () => {
    const r = fusionnerSuggestions(CODE, ["Zeta", "émeraude", "Alpha", "Epsilon"], (v) => v);
    expect(r).toEqual([...CODE, "Alpha", "émeraude", "Epsilon", "Zeta"]);
  });
  it("ne mute pas la liste du code", () => {
    const code = ["B", "A"];
    expect(fusionnerSuggestions(code, ["C"], (v) => v)).toEqual(["B", "A", "C"]);
    expect(code).toEqual(["B", "A"]);
  });
});

describe("suggestions RIS et outils de RDV", () => {
  it("propose un nouveau RIS, pas ses variantes d'un éditeur du code", () => {
    const r = suggestionsRis(["Hexagone (à confirmer)", "Hexagone", "Xplore"]);
    expect(r).toContain("Hexagone");
    expect(r.filter((v) => /xplore/i.test(v))).toEqual(["Xplore (EDL)"]);
  });
  it("propose un nouvel outil de RDV et écarte « Doctolib et téléphone »", () => {
    const r = suggestionsRdv(["Mon outil", "Doctolib et téléphone"]);
    expect(r).toContain("Mon outil");
    expect(r.filter((v) => /doctolib/i.test(v))).toEqual(["Doctolib"]);
  });
});

describe("métiers des contacts (C-88)", () => {
  it("la liste du code d'abord, puis les métiers saisis, sans doublon de casse ni d'espaces", () => {
    const liste = suggestionsMetier([{ valeur: "gérant", nombre: 3 }, { valeur: "Kinésithérapeute", nombre: 1 }, { valeur: " kinésithérapeute ", nombre: 2 }, { valeur: null, nombre: 4 }],
      ["Gérant", "Radiologue"]);
    expect(liste).toEqual(["Gérant", "Radiologue", "kinésithérapeute"]);
  });
});

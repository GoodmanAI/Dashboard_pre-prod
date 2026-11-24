import { describe, expect, it } from "vitest";
import { designeUnConcurrent, typeSuggere } from "./designation";
import { OUTILS_RDV } from "@/pilot/lib/organisations/referentielClient";

describe("designeUnConcurrent", () => {
  it("reconnaît le robot vocal concurrent de la liste des outils de RDV", () => {
    expect(designeUnConcurrent({ outilRdv: "Robot vocal concurrent" })).toBe(true);
    expect(OUTILS_RDV.filter((o) => designeUnConcurrent({ outilRdv: o }))).toEqual(["Robot vocal concurrent"]);
  });
  it("reconnaît un secrétariat ou un centre d'appels externalisé, quelle que soit la casse", () => {
    expect(designeUnConcurrent({ outilRdv: "Secrétariat externalisé" })).toBe(true);
    expect(designeUnConcurrent({ outilRdv: "secretariat externalise" })).toBe(true);
    expect(designeUnConcurrent({ outilRdv: "Centre d'appels" })).toBe(true);
  });
  it("ne se déclenche pas pour un outil de RDV ordinaire", () => {
    for (const outil of ["Doctolib", "Téléphone seul", "EasyDoct", "", null, undefined]) expect(designeUnConcurrent({ outilRdv: outil })).toBe(false);
  });
  it("se déclenche dès qu'une solution actuelle est renseignée", () => {
    expect(designeUnConcurrent({ outilRdv: "Doctolib", solutionActuelle: "Standard externalisé" })).toBe(true);
  });
  it("ignore une solution actuelle vide ou faite d'espaces", () => {
    expect(designeUnConcurrent({ solutionActuelle: "   " })).toBe(false);
    expect(designeUnConcurrent({ solutionActuelle: null })).toBe(false);
  });
});

describe("typeSuggere", () => {
  it("propose le type qui correspond à l'outil de RDV saisi", () => {
    expect(typeSuggere("Robot vocal concurrent")).toBe("ROBOT_VOCAL");
    expect(typeSuggere("Secrétariat externalisé")).toBe("SECRETARIAT_EXTERNALISE");
    expect(typeSuggere("Centre d'appels")).toBe("CENTRE_APPELS");
  });
  it("propose « Autre » sans indice", () => {
    expect(typeSuggere("Doctolib")).toBe("AUTRE");
    expect(typeSuggere(null)).toBe("AUTRE");
  });
});

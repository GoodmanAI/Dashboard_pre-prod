import { describe, expect, it } from "vitest";
import {
  comparerProspects, departementDuCodePostal, etatProspection, ilYA, motsSignificatifs, normaliser, prefixesCodePostal, regionDuCodePostal,
  REGIONS, scoreDoublon, SEUIL_DOUBLON, type CleRegion,
} from "./regles";

const jour = (iso: string) => new Date(iso + "T00:00:00Z");

describe("noms d'établissements (C-65)", () => {
  it("normalise accents, casse et ponctuation", () => {
    expect(normaliser("Saint-Étienne, Hôpital Nord")).toBe("saint etienne hopital nord");
  });
  it("ne garde que les mots qui distinguent", () => {
    expect(motsSignificatifs("CH de Cornouaille (Quimper)")).toEqual(["cornouaille", "quimper"]);
    expect(motsSignificatifs("Centre d'imagerie médicale du Ballius")).toEqual(["ballius"]);
    expect(motsSignificatifs("Centre hospitalier")).toEqual([]);
  });
});

describe("doublons à la saisie (C-65)", () => {
  const clairval = { nom: "Imagerie de Clairval (Ramsay Santé, Marseille)", villes: ["Marseille"] };
  const chu = { nom: "CHU de Saint-Étienne", villes: ["Saint-Étienne"] };
  it("trouve un nom court contenu dans le nom complet", () => {
    expect(scoreDoublon({ nom: "Clairval" }, clairval)).toBeGreaterThanOrEqual(SEUIL_DOUBLON);
  });
  it("reconnaît le même nom écrit autrement", () => {
    expect(scoreDoublon({ nom: "imagerie de CLAIRVAL (ramsay sante, marseille)" }, clairval)).toBe(1);
  });
  it("ne rapproche jamais sur la seule ville", () => {
    expect(scoreDoublon({ nom: "Clinique Mutualiste", ville: "Saint-Étienne" }, chu)).toBe(0);
    expect(scoreDoublon({ nom: "Clinique Mutualiste Saint-Étienne", ville: "Saint-Étienne" }, chu)).toBe(0);
  });
  it("la même ville renforce un nom qui concorde déjà", () => {
    const sans = scoreDoublon({ nom: "Radiologie Clairval Prado" }, clairval);
    const avec = scoreDoublon({ nom: "Radiologie Clairval Prado", ville: "Marseille" }, clairval);
    expect(avec).toBeGreaterThan(sans);
  });
  it("un nom sans mot distinctif ne rapproche rien", () => {
    expect(scoreDoublon({ nom: "Centre de radiologie" }, clairval)).toBe(0);
  });
});

describe("région déduite du code postal (C-65)", () => {
  it("lit le département, Corse et outre-mer compris", () => {
    expect(departementDuCodePostal("13008")).toBe("13");
    expect(departementDuCodePostal("01000")).toBe("01");
    expect(departementDuCodePostal("20000")).toBe("2A");
    expect(departementDuCodePostal("20200")).toBe("2B");
    expect(departementDuCodePostal("97200")).toBe("972");
    expect(departementDuCodePostal(" 29 000 ")).toBe("29");
  });
  it("ne devine rien hors de France ou sur une saisie incomplète", () => {
    expect(departementDuCodePostal("98000")).toBeNull();
    expect(departementDuCodePostal("1200")).toBeNull();
    expect(departementDuCodePostal(null)).toBeNull();
  });
  it("range chaque département dans une seule région", () => {
    expect(regionDuCodePostal("59000")).toBe("HDF");
    expect(regionDuCodePostal("97100")).toBe("GUA");
    expect(regionDuCodePostal("20090")).toBe("COR");
    const tous = Object.values(REGIONS).flatMap((r) => [...r.departements]);
    expect(new Set(tous).size).toBe(tous.length);
    expect(tous).toHaveLength(101);
  });
  it("donne les débuts de code postal à chercher en base", () => {
    expect(prefixesCodePostal("COR")).toEqual(["200", "201", "202", "203", "204", "205", "206"]);
    expect(prefixesCodePostal("BRE")).toEqual(["22", "29", "35", "56"]);
    for (const r of Object.keys(REGIONS) as CleRegion[]) {
      for (const p of prefixesCodePostal(r)) expect(regionDuCodePostal(p.padEnd(5, "0"))).toBe(r);
    }
  });
});

describe("état d'un prospect (C-65)", () => {
  const maintenant = new Date("2026-11-06T15:00:00Z");
  it("jamais contacté, contacté, à relancer", () => {
    expect(etatProspection({ dernierEchangeLe: null, prochaineActionLe: null }, maintenant)).toBe("JAMAIS");
    expect(etatProspection({ dernierEchangeLe: jour("2026-10-01"), prochaineActionLe: jour("2026-11-20") }, maintenant)).toBe("CONTACTE");
    expect(etatProspection({ dernierEchangeLe: jour("2026-10-01"), prochaineActionLe: jour("2026-11-05") }, maintenant)).toBe("A_RELANCER");
  });
  it("une action prévue aujourd'hui n'est pas encore en retard", () => {
    expect(etatProspection({ dernierEchangeLe: null, prochaineActionLe: jour("2026-11-06") }, maintenant)).toBe("JAMAIS");
  });
  it("dit depuis quand, en mots", () => {
    expect(ilYA(jour("2026-11-06"), maintenant)).toBe("aujourd'hui");
    expect(ilYA(jour("2026-11-05"), maintenant)).toBe("hier");
    expect(ilYA(jour("2026-10-25"), maintenant)).toBe("il y a 12 j");
    expect(ilYA(jour("2026-06-01"), maintenant)).toBe("il y a 5 mois");
    expect(ilYA(jour("2024-01-10"), maintenant)).toBe("il y a 2 ans");
  });
});

describe("ordre de la liste À prospecter", () => {
  const p = (nom: string, priorite: "A_PLUS" | "A" | "B" | "C" | null, relance: string | null, echange: string | null) =>
    ({ nom, priorite, prochaineActionLe: relance ? jour(relance) : null, dernierEchangeLe: echange ? jour(echange) : null });
  const ordre = (liste: ReturnType<typeof p>[]) => [...liste].sort(comparerProspects).map((x) => x.nom);
  it("met les priorités hautes d'abord, sans priorité en dernier", () => {
    expect(ordre([p("sans", null, null, null), p("c", "C", null, null), p("a+", "A_PLUS", null, null), p("a", "A", null, null)])).toEqual(["a+", "a", "c", "sans"]);
  });
  it("à priorité égale, relance la plus ancienne d'abord, sans relance en dernier", () => {
    expect(ordre([p("rien", "A", null, null), p("tard", "A", "2026-12-01", null), p("tot", "A", "2026-11-01", null)])).toEqual(["tot", "tard", "rien"]);
  });
  it("à relance égale, jamais contacté avant contacté, puis le plus ancien échange", () => {
    expect(ordre([p("recent", "A", null, "2026-11-10"), p("jamais", "A", null, null), p("ancien", "A", null, "2026-09-01")])).toEqual(["jamais", "ancien", "recent"]);
  });
  it("départage enfin par le nom", () => {
    expect(ordre([p("Beta", "B", null, null), p("Alpha", "B", null, null)])).toEqual(["Alpha", "Beta"]);
  });
});

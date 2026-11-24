import { describe, expect, it } from "vitest";
import { ajouterMois, echeancesContrat, renouvellementContrat, transitionContrat } from "./regles";
const d = (s: string) => new Date(s + "T12:34:56.789Z");
describe("mois calendaires UTC", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"], ["2024-01-31", 1, "2024-02-29"], ["2024-02-29", 12, "2025-02-28"],
    ["2026-03-31", -1, "2026-02-28"], ["2024-03-31", -1, "2024-02-29"], ["2026-01-31", -2, "2025-11-30"],
    ["2026-12-31", 1, "2027-01-31"], ["2024-02-29", 0, "2024-02-29"],
  ])("%s + %i mois", (date, n, attendu) => {
    const origine = d(String(date));
    expect(ajouterMois(origine, Number(n))).toEqual(d(String(attendu)));
    expect(origine).toEqual(d(String(date)));
  });
});
describe("échéances du contrat", () => {
  const maintenant = new Date("2026-10-28T20:00:00Z");
  const vide = { signeLe: null, debuteLe: null, engagementMois: null, preavisMois: null, renouvelleLe: null };
  it("n'invente ni durée ni date", () => {
    expect(echeancesContrat(vide, maintenant)).toEqual({ finEngagement: null, limitePreavis: null, prochaineEcheance: null });
    expect(echeancesContrat({ ...vide, engagementMois: 24 }, maintenant).finEngagement).toBeNull();
    expect(echeancesContrat({ ...vide, signeLe: d("2025-01-01") }, maintenant).finEngagement).toBeNull();
  });
  it("privilégie le début, puis la signature et calcule le préavis", () => {
    const c = { ...vide, signeLe: d("2024-10-31"), debuteLe: d("2024-11-30"), engagementMois: 24, preavisMois: 3 };
    expect(echeancesContrat(c, maintenant)).toEqual({ finEngagement: d("2026-11-30"), limitePreavis: d("2026-08-30"), prochaineEcheance: d("2026-11-30") });
    expect(echeancesContrat({ ...c, debuteLe: null }, maintenant).finEngagement).toEqual(d("2026-10-31"));
  });
  it("retient la plus proche date future, aujourd'hui inclus, et ignore les échéances passées", () => {
    const c = { ...vide, debuteLe: new Date("2025-10-28"), engagementMois: 12, renouvelleLe: d("2026-12-01") };
    expect(echeancesContrat(c, maintenant).prochaineEcheance).toEqual(new Date("2026-10-28"));
    expect(echeancesContrat({ ...c, debuteLe: d("2025-10-27") }, maintenant).prochaineEcheance).toEqual(c.renouvelleLe);
    expect(echeancesContrat({ ...c, debuteLe: d("2025-10-27"), renouvelleLe: d("2026-10-27") }, maintenant).prochaineEcheance).toBeNull();
    expect(echeancesContrat({ ...c, debuteLe: d("2026-11-01"), renouvelleLe: d("2026-10-30") }, maintenant).prochaineEcheance).toEqual(d("2026-10-30"));
  });
  it("accepte zéro mois sans le confondre avec une durée absente", () => {
    expect(echeancesContrat({ ...vide, signeLe: maintenant, engagementMois: 0, preavisMois: 0 }, maintenant)).toEqual({ finEngagement: maintenant, limitePreavis: maintenant, prochaineEcheance: maintenant });
  });
});
const statuts = ["BROUILLON", "ACTIF", "TERMINE"] as const;
it.each(statuts.flatMap((de) => statuts.map((vers) => ({ de, vers }))))("transition $de vers $vers", ({ de, vers }) => {
  expect(transitionContrat(de, vers)).toBe(["BROUILLON:ACTIF", "ACTIF:TERMINE"].includes(de + ":" + vers));
});

describe("renouvellement partagé par les alertes et le Parc", () => {
  const maintenant = new Date("2026-10-30T09:00:00Z");
  const base = { statut: "ACTIF" as const, signeLe: null, debuteLe: new Date("2024-12-29"), engagementMois: 24, preavisMois: 3, renouvelleLe: null };
  it("dit l'échéance, la date qui ordonne et le texte de l'alerte", () => {
    expect(renouvellementContrat(base, maintenant)).toEqual({ dateFait: new Date("2026-09-29"), echeance: new Date("2026-12-29"),
      detail: "Fin d'engagement le 29 déc. Préavis dépassé depuis le 29 sept." });
    expect(renouvellementContrat({ ...base, preavisMois: null }, maintenant)).toEqual({ dateFait: new Date("2026-12-29"), echeance: new Date("2026-12-29"),
      detail: "Fin d'engagement le 29 déc." });
  });
  it("rien hors de la fenêtre, rien pour un contrat qui n'est pas actif", () => {
    expect(renouvellementContrat({ ...base, engagementMois: 36, preavisMois: null }, maintenant)).toBeNull();
    expect(renouvellementContrat({ ...base, statut: "TERMINE" }, maintenant)).toBeNull();
    expect(renouvellementContrat({ ...base, statut: "BROUILLON" }, maintenant)).toBeNull();
  });
});

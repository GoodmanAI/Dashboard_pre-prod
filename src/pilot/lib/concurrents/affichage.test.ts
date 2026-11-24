import { describe, expect, it } from "vitest";
import { ancienneteReleve, PRIX_NON_RELEVE, prixInstallationAffiche, prixSalleAffiche, releveAncien, repartirEtablissements, resumePrix } from "./affichage";

const maintenant = new Date("2026-11-18T10:00:00Z");
const espaces = (t: string) => t.replace(/[  ]/g, " ");

describe("prix d'un relevé", () => {
  it("dit quel prix n'est pas relevé quand il manque, jamais 0 €", () => {
    expect(prixSalleAffiche(null)).toBe("Par salle et par mois : prix non relevé");
    expect(prixSalleAffiche(undefined)).toBe("Par salle et par mois : prix non relevé");
    expect(prixInstallationAffiche(null)).toBe("Installation : prix non relevé");
    expect(prixInstallationAffiche(undefined)).toBe("Installation : prix non relevé");
    expect(prixSalleAffiche(null)).not.toContain("0");
    expect(prixInstallationAffiche(null)).not.toMatch(/€|—/u);
  });
  it("écrit un prix en euros avec deux décimales", () => {
    expect(espaces(prixSalleAffiche(1200))).toBe("12,00 € par salle et par mois");
    expect(espaces(prixInstallationAffiche(50000))).toBe("500,00 € d'installation");
  });
  it("garde un prix à zéro centime : gratuit n'est pas non relevé", () => {
    expect(espaces(prixSalleAffiche(0))).toBe("0,00 € par salle et par mois");
  });
});

describe("ancienneté d'un relevé", () => {
  it("dit l'âge en jours, en mois ou en années", () => {
    expect(ancienneteReleve("2026-11-18", maintenant)).toBe("Relevé aujourd'hui");
    expect(ancienneteReleve("2026-11-17", maintenant)).toBe("Relevé hier");
    expect(ancienneteReleve("2026-08-18", maintenant)).toBe("Relevé il y a 3 mois");
    expect(ancienneteReleve(new Date("2024-01-10"), maintenant)).toBe("Relevé il y a 2 ans");
  });
  it("annonce un relevé de plus d'un an", () => {
    expect(releveAncien("2025-11-17", maintenant)).toBe(true);
    expect(releveAncien("2026-01-01", maintenant)).toBe(false);
  });
});

describe("resumePrix", () => {
  it("sans relevé, dit que le prix n'est pas relevé et ne donne pas d'âge", () => {
    expect(resumePrix(null, maintenant)).toEqual({ prix: PRIX_NON_RELEVE, anciennete: null });
  });
  it("avec un relevé sans prix par salle, garde l'âge du relevé", () => {
    expect(resumePrix({ prixSalleMoisCentimes: null, releveLe: "2026-08-18" }, maintenant)).toEqual({ prix: PRIX_NON_RELEVE, anciennete: "Relevé il y a 3 mois" });
  });
  it("avec un prix, le donne par salle", () => {
    expect(espaces(resumePrix({ prixSalleMoisCentimes: 900, releveLe: "2026-11-01" }, maintenant).prix)).toBe("9,00 € par salle");
  });
});

describe("établissements équipés", () => {
  it("sépare ceux qui l'ont encore de ceux passés chez Lyrae, d'après le lien calculé par le serveur, l'ordre gardé", () => {
    const centres = [
      { id: 1, lien: "en_place" as const }, { id: 2, lien: "passe_chez_lyrae" as const },
      { id: 3, lien: "en_place" as const }, { id: 4, lien: "passe_chez_lyrae" as const },
    ];
    const { enPlace, passesChezLyrae } = repartirEtablissements(centres);
    expect(enPlace.map((c) => c.id)).toEqual([1, 3]);
    expect(passesChezLyrae.map((c) => c.id)).toEqual([2, 4]);
  });
  it("une liste vide donne deux groupes vides", () => expect(repartirEtablissements([])).toEqual({ enPlace: [], passesChezLyrae: [] }));
});

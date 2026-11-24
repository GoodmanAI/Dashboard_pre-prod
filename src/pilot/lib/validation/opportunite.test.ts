import { describe, expect, it } from "vitest";
import { creationOpportunite, modificationOpportunite, conclusionOpportunite } from "./opportunite";
import { acceptationProposition } from "./proposition";
import { moisAttendu } from "@/pilot/lib/opportunites/regles";
import { messageValidation } from "./messages";
const base = { organisationId: 1, productId: 2, montantMensuelCentimes: 120000, montantMiseEnServiceCentimes: 100 };
describe("opportunités", () => {
  it.each([0, 10, 100])("probabilité entière %i", (probabilite) => expect(creationOpportunite.safeParse({ ...base, probabilite }).success).toBe(true));
  it.each([-1, 101, 1.5, "50"])("probabilité refusée %s", (probabilite) => {
    const r = modificationOpportunite.safeParse({ operation: "modifier", probabilite });
    expect(r.success).toBe(false); if (!r.success) expect(messageValidation(r.error)).toContain("Probabilité");
  });
  it("sépare saisie et retour à l'étape", () => {
    expect(modificationOpportunite.safeParse({ operation: "modifier", revenirALEtape: true }).success).toBe(true);
    expect(modificationOpportunite.safeParse({ operation: "modifier", revenirALEtape: true, probabilite: 10 }).success).toBe(false);
  });
  it.each([undefined, "", "  ", "x".repeat(501)])("raison de perte obligatoire et bornée", (raisonPerte) => {
    expect(conclusionOpportunite.safeParse({ issue: "perdue", raisonPerte }).success).toBe(false);
    const r = modificationOpportunite.safeParse({ operation: "conclure", issue: "perdue", raisonPerte });
    expect(r.success).toBe(false); if (!r.success) expect(messageValidation(r.error)).toContain("Raison de perte");
  });
  it("accepte une raison de 1 à 500 caractères et un gain sans raison", () => {
    for (const raisonPerte of ["x", "x".repeat(500)]) expect(conclusionOpportunite.safeParse({ issue: "perdue", raisonPerte }).success).toBe(true);
    expect(conclusionOpportunite.safeParse({ issue: "gagnee" }).success).toBe(true);
  });
  it.each(["ENGAGE", "PROBABLE", "POSSIBLE", "EXCLU"])("catégorie %s indépendante de la probabilité", (categoriePrevision) => expect(creationOpportunite.safeParse({ ...base, categoriePrevision }).success).toBe(true));
  it("mois normalisé en UTC sans modifier l'entrée", () => {
    const date = new Date("2027-03-31T23:59:59Z");
    expect(moisAttendu(date)).toEqual(new Date("2027-03-01")); expect(date.getUTCDate()).toBe(31); expect(moisAttendu(null)).toBeNull();
  });
  it.each([-1, 1.2, 100000001])("montants bornés %s", (n) => {
    for (const champ of ["montantMensuelCentimes", "montantMiseEnServiceCentimes"]) expect(creationOpportunite.safeParse({ ...base, [champ]: n }).success).toBe(false);
  });
  it("identifiants de remplacement validés", () => {
    expect(acceptationProposition.safeParse({ remplaceContratIds: [1, 2] }).success).toBe(true);
    for (const remplaceContratIds of [[-1], [1.2], [2147483648], ["1"], "1"]) expect(acceptationProposition.safeParse({ remplaceContratIds }).success).toBe(false);
  });
});

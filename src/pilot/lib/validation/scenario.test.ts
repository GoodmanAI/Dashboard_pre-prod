import { describe, expect, it } from "vitest";
import { creationScenario, modificationScenario } from "./scenario";

const ligne = { opportuniteId: 1, cochee: true, demarrageDecaleLe: null };
const valide = { nom: "Prudent", opportunites: [ligne] };
describe("validation des scénarios", () => {
  it("normalise le nom, les notes et les décalages au mois UTC", () => {
    expect(creationScenario.parse({ ...valide, nom: " Prudent ", notes: " ", opportunites: [{ ...ligne, demarrageDecaleLe: "2027-03-26" }] })).toEqual({
      nom: "Prudent", notes: null, opportunites: [{ ...ligne, demarrageDecaleLe: new Date("2027-03-01") }],
    });
  });
  it.each(["", " ", "a".repeat(121)])("refuse le nom invalide %s", (nom) => expect(creationScenario.safeParse({ ...valide, nom }).success).toBe(false));
  it("accepte 120 caractères et un scénario vide", () => expect(creationScenario.safeParse({ nom: "a".repeat(120), opportunites: [] }).success).toBe(true));
  it("refuse les doublons, identifiants invalides, dates invalides et cases non booléennes", () => {
    for (const opportunites of [[ligne,ligne], [{ ...ligne, opportuniteId: 0 }], [{ ...ligne, opportuniteId: 1.5 }], [{ ...ligne, cochee: "true" }], [{ ...ligne, demarrageDecaleLe: "invalide" }], [{ ...ligne, demarrageDecaleLe: undefined }]]) {
      expect(creationScenario.safeParse({ ...valide, opportunites }).success).toBe(false);
    }
  });
  it("refuse les champs supplémentaires et les notes trop longues", () => {
    expect(creationScenario.safeParse({ ...valide, auteurId: 1 }).success).toBe(false);
    expect(creationScenario.safeParse({ ...valide, notes: "x".repeat(5001) }).success).toBe(false);
  });
  it("exige la version précise à la modification", () => {
    expect(modificationScenario.safeParse(valide).success).toBe(false);
    expect(modificationScenario.safeParse({ ...valide, majLe: "invalide" }).success).toBe(false);
    expect(modificationScenario.parse({ ...valide, majLe: "2026-10-28T12:34:56.123Z" }).majLe.toISOString()).toBe("2026-10-28T12:34:56.123Z");
  });
});

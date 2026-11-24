import { describe, expect, it } from "vitest";
import {
  exiger, peutLirePilot, peutModifierPilot, peutChangerEtape, peutAcquitter, peutExporter, peutGererComptes, peutDonnerAccesDashboard,
  peutVoirCa, peutExporterCa, peutModifierLesMontants, peutEvaluer,
} from "./autorisations";
import { droitsEffectifs } from "./acces/droits";

describe("autorisations par rôle", () => {
  it.each([
    ["SUPER_ADMIN", true, true],
    ["ADMIN", true, false],
    ["CLIENT", false, false],
    ["INCONNU", false, false],
  ] as const)("%s", (role, interne, superAdmin) => {
    for (const autorisation of [peutLirePilot, peutModifierPilot, peutChangerEtape, peutAcquitter]) {
      expect(autorisation(role)).toBe(interne);
    }
    expect(peutExporter({ role })).toBe(superAdmin);
    expect(peutGererComptes({ role })).toBe(superAdmin);
    expect(peutGererComptes({ role, administrateurPilot: true })).toBe(superAdmin || role === "ADMIN");
    expect(peutDonnerAccesDashboard(role)).toBe(role === "SUPER_ADMIN");
  });
  it("exiger refuse en 403 avec le message fourni", () => {
    expect(() => exiger(false, "Action réservée.")).toThrowError(expect.objectContaining({
      statut: 403, message: "Action réservée.",
    }));
    expect(() => exiger(true)).not.toThrow();
  });
});

describe("autorisations par droit (C-64)", () => {
  const acteur = (role: string, acces: Parameters<typeof droitsEffectifs>[1]) => ({ role, droits: droitsEffectifs(role, acces) });
  it("le super-administrateur peut tout", () => {
    const a = acteur("SUPER_ADMIN", null);
    expect([peutVoirCa(a), peutExporterCa(a), peutModifierLesMontants(a), peutEvaluer(a)]).toEqual([true, true, true, true]);
  });
  it("un développeur n'ouvre pas le chiffre d'affaires, même si la base le dit", () => {
    const a = acteur("ADMIN", { profil: "DEVELOPPEUR", droits: ["VOIR_CA", "EXPORTER_CA", "MODIFIER_MONTANTS"], retireLe: null });
    expect(peutVoirCa(a)).toBe(false);
    expect(peutExporterCa(a)).toBe(false);
    expect(peutModifierLesMontants(a)).toBe(true);
  });
  it("un gérant a ce qu'on lui a coché", () => {
    const a = acteur("ADMIN", { profil: "GERANT", droits: ["VOIR_CA"], retireLe: null });
    expect([peutVoirCa(a), peutExporterCa(a), peutModifierLesMontants(a), peutEvaluer(a)]).toEqual([true, false, false, false]);
  });
  it("un client n'a rien, quels que soient les droits qu'on lui prête", () => {
    const a = { role: "CLIENT", droits: ["VOIR_CA", "EXPORTER_CA", "MODIFIER_MONTANTS", "EVALUER_PARC"] as const };
    expect([peutVoirCa(a), peutExporterCa(a), peutModifierLesMontants(a), peutEvaluer(a)]).toEqual([false, false, false, false]);
  });
});

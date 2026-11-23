import { describe, expect, it } from "vitest";
import { modificationEchange, modificationProchaineAction, saisieEchange } from "./echange";
import { majContact } from "./contact";
import { changementEtape, majOrganisation } from "./organisation";
import { verifierDateRendezVous } from "../echanges/ecrire";

describe("routes des actions", () => {
  it("accepte faite seule ou avec suite, et transforme les dates", () => {
    expect(modificationProchaineAction.parse({ operation: "faite" })).toEqual({ operation: "faite" });
    expect(modificationProchaineAction.safeParse({ operation: "faite", suite: { type: "VISITE", prochaineAction: "Rappeler", prochaineActionLe: "2026-11-01" } }).success).toBe(true);
    expect(modificationProchaineAction.parse({ operation: "replanifier", le: "2026-11-01" })).toEqual({ operation: "replanifier", le: new Date("2026-11-01") });
  });
  it.each([{}, { operation: "annuler" }, { operation: "replanifier" }, { operation: "replanifier", le: "" }, { operation: "faite", suite: {} }, { operation: "faite", le: "2026-11-01" }])(
    "refuse une commande d'action invalide", (p) => expect(modificationProchaineAction.safeParse(p).success).toBe(false));
  it.each([{ operation: "realiser" }, { operation: "annuler" }, { operation: "replanifier", le: "2026-11-01" }])(
    "accepte une commande de rendez-vous", (p) => expect(modificationEchange.safeParse(p).success).toBe(true));
  it.each([{ operation: "faite" }, { operation: "annuler", compteRendu: "Texte" }, { operation: "realiser", prochaineActionLe: "non" }])(
    "refuse une commande de rendez-vous invalide", (p) => expect(modificationEchange.safeParse(p).success).toBe(false));
  it.each(["JALON", "FORMATION", "VISITE"])("accepte le nouveau type %s", (type) =>
    expect(saisieEchange.parse({ organisationId: 1, type, statut: "PLANIFIE", surveneuLe: "2026-11-01", ...(type === "JALON" ? { aLaChargeDe: "CLIENT", compteRendu: "Validation" } : {}) }).statut).toBe("PLANIFIE"));
  it("refuse la saisie directe d'une annulation", () => expect(saisieEchange.safeParse({ organisationId: 1, type: "APPEL", statut: "ANNULE", surveneuLe: "2026-11-01" }).success).toBe(false));
  it("autorise aujourd'hui, refuse hier", () => {
    const maintenant = new Date("2026-10-26T18:00:00Z");
    expect(() => verifierDateRendezVous(new Date("2026-10-26"), maintenant)).not.toThrow();
    expect(() => verifierDateRendezVous(new Date("2026-10-25"), maintenant)).toThrow("Un rendez-vous se planifie aujourd'hui ou plus tard.");
  });
  it("valide qualification, dates effacées et attitude sans date manuelle", () => {
    expect(majOrganisation.safeParse({ qualifBesoin: true, solutionActuelle: "", decisionAttendueLe: null }).success).toBe(true);
    expect(majOrganisation.safeParse({ qualifBesoin: "true" }).success).toBe(false);
    expect(majContact.parse({ attitude: "SOUTIEN" })).toEqual({ attitude: "SOUTIEN" });
    expect(majContact.safeParse({ dernierContactLe: "2026-11-01" }).success).toBe(false);
    expect(changementEtape.safeParse({ etape: "PERDU", raisonSortieCode: "FAUX" }).success).toBe(false);
  });
});

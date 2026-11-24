import { describe, expect, it } from "vitest";
import { aCompleter } from "./aCompleter";
import type { CrmEtapeCommerciale } from "@prisma/client";

const minimale = { etape: "PROSPECT" as CrmEtapeCommerciale, prochaineActionLe: new Date("2026-11-01"), ris: null, chefDeProjetId: null, contacts: [], centres: [] };
const complete = { ...minimale, etape: "EN_INTEGRATION" as CrmEtapeCommerciale, ris: "Xplore", chefDeProjetId: 1,
  contacts: [{ principal: true }], centres: [{ id: 1, rattachements: [{ id: 2, datePromise: new Date() }] }] };
describe("à compléter", () => {
  it("demande de dater l'action commerciale", () => expect(aCompleter({ ...minimale, prochaineActionLe: null })[0])
    .toEqual({ libelle: "Dater la prochaine action", onglet: "chronologie", action: "action" }));
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE"] as const)("demande seulement contact et centre en %s", (etape) => {
    expect(aCompleter({ ...minimale, etape }).map((c) => c.libelle)).toEqual(["Ajouter un contact principal", "Ajouter un premier centre"]);
  });
  it("un contact secondaire ne remplace pas un principal", () => expect(aCompleter({ ...complete, contacts: [{ principal: false }] })).toEqual([
    { libelle: "Ajouter un contact principal", onglet: "contacts", action: "contact" },
  ]));
  it.each(["PROPOSITION", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const)("demande RIS et produit en %s", (etape) => {
    const manques = aCompleter({ ...complete, etape, ris: " ", centres: [{ id: 1, rattachements: [] }] });
    expect(manques.map((c) => c.libelle)).toEqual(["Préciser le RIS", "Ajouter un produit à un centre"]);
    expect(manques[1].cibleId).toBe(1);
  });
  it("sans centre, ne propose pas deux fois la même action", () => {
    const manques = aCompleter({ ...complete, etape: "PROPOSITION", centres: [] }).map((c) => c.libelle);
    expect(manques).toContain("Ajouter un premier centre");
    expect(manques).not.toContain("Ajouter un produit à un centre");
  });
  it.each(["SIGNE", "EN_INTEGRATION"] as const)("demande chef et date en %s", (etape) => {
    expect(aCompleter({ ...complete, etape, chefDeProjetId: null, centres: [{ id: 1, rattachements: [{ id: 2, datePromise: null }] }] }))
      .toEqual([{ libelle: "Nommer un chef de projet", onglet: "resume", action: "organisation" }, { libelle: "Poser une date promise", onglet: "centres", action: "date", cibleId: 2 }]);
  });
  it("ne demande plus de chef ni de date en production", () => expect(aCompleter({ ...complete, etape: "EN_PRODUCTION", chefDeProjetId: null, centres: [{ id: 1, rattachements: [{ id: 2, datePromise: null }] }] })).toEqual([]));
  it("ordonne les actions sans dupliquer les dates manquantes", () => {
    const resultat = aCompleter({ ...minimale, etape: "SIGNE", centres: [{ id: 1, rattachements: [{ id: 2, datePromise: null }, { id: 3, datePromise: null }] }] });
    expect(resultat.map((c) => c.libelle)).toEqual(["Ajouter un contact principal", "Préciser le RIS", "Nommer un chef de projet", "Poser une date promise"]);
  });
  it.each(["PERDU", "EN_SOMMEIL", "ARRETE"] as const)("ne demande rien en %s", (etape) => expect(aCompleter({ ...minimale, etape })).toEqual([]));
  it("une fiche complète n'a aucune action", () => expect(aCompleter(complete)).toEqual([]));
});

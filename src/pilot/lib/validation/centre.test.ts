import { describe, expect, it } from "vitest";
import { creationCentre, majCentre, creationRattachement, majRattachement } from "./centre";

describe("validation des centres", () => {
  it.each(["", " ", "a".repeat(201)])("refuse un nom invalide", (nom) => expect(creationCentre.safeParse({ organisationId: 1, nom }).success).toBe(false));
  it("accepte 200 caractères et les champs effacés", () => expect(creationCentre.parse({ organisationId: 1, nom: "a".repeat(200), ville: " ", codeSite: "" })).toMatchObject({ ville: null, codeSite: null }));
  it.each([{}, { nom: "" }, { organisationId: 2 }])("refuse une modification invalide", (v) => expect(majCentre.safeParse(v).success).toBe(false));
  it("accepte une modification partielle", () => expect(majCentre.parse({ ville: " Site " })).toEqual({ ville: "Site" }));
});
describe("validation des rattachements", () => {
  it("accepte les valeurs minimales", () => expect(creationRattachement.parse({ centreId: 1, productId: 2 })).toEqual({ centreId: 1, productId: 2 }));
  it.each([{ centreId: 0 }, { productId: 1.2 }, { userProductId: -1 }, { datePromise: "" }, { datePromise: "invalide" }])(
    "refuse une création invalide", (v) => expect(creationRattachement.safeParse({ centreId: 1, productId: 2, ...v }).success).toBe(false));
  it("transforme les dates et accepte l'effacement", () => {
    expect(majRattachement.parse({ datePromise: "2026-11-01" }).datePromise).toEqual(new Date("2026-11-01"));
    expect(majRattachement.parse({ datePromise: null, userProductId: null })).toEqual({ datePromise: null, userProductId: null });
  });
  it.each([{}, { centreId: 1 }, { productId: 2 }, { datePromise: " " }])("refuse une modification invalide", (v) => expect(majRattachement.safeParse(v).success).toBe(false));
});

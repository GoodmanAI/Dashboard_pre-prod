import { describe, expect, it } from "vitest";
import { creationContact, majContact } from "./contact";

const base = { organisationId: 1, nom: " Contact " };
describe("validation contact", () => {
  it("pose les valeurs par défaut", () => expect(creationContact.parse(base)).toEqual({ organisationId: 1, nom: "Contact", roleDecision: "INCONNU", principal: false, facturation: false, attitude: "INCONNU" }));
  it.each([{ nom: "" }, { nom: "  " }, { nom: "a".repeat(201) }, { email: "invalide" }, { notes: "a".repeat(2001) }, { roleDecision: "AUTRE" }, { principal: "true" }, { organisationId: 0 }])(
    "refuse les champs invalides : %j", (v) => expect(creationContact.safeParse({ ...base, ...v }).success).toBe(false));
  it("accepte les bornes et normalise les textes", () => {
    expect(creationContact.parse({ ...base, nom: "a".repeat(200), notes: "a".repeat(2000), email: " ", telephone: "", fonction: "" }))
      .toMatchObject({ email: null, telephone: null, fonction: null });
  });
  it.each([{}, { email: "non" }, { nom: "" }, { organisationId: 2 }])("refuse une modification invalide", (v) => expect(majContact.safeParse(v).success).toBe(false));
  it("ne réintroduit aucun défaut lors d'une modification", () => expect(majContact.parse({ email: "" })).toEqual({ email: null }));
});

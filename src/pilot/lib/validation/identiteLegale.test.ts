import { describe, expect, it } from "vitest";
import { majOrganisation } from "./organisation";
import { majCentre } from "./centre";

describe("identité légale (C-89)", () => {
  it("SIREN à 9 chiffres, espaces retirés, vide devient null", () => {
    expect(majOrganisation.parse({ siren: "123 456 789" }).siren).toBe("123456789");
    expect(majOrganisation.parse({ siren: "" }).siren).toBeNull();
    expect(majOrganisation.safeParse({ siren: "12345678" }).success).toBe(false);
    expect(majOrganisation.safeParse({ siretSiege: "1234567890001" }).success).toBe(false);
    expect(majOrganisation.parse({ siretSiege: "12345678900011" }).siretSiege).toBe("12345678900011");
  });
  it("SIRET d'un centre à 14 chiffres", () => {
    expect(majCentre.parse({ siret: "123 456 789 00011" }).siret).toBe("12345678900011");
    expect(majCentre.safeParse({ siret: "abc" }).success).toBe(false);
  });
});

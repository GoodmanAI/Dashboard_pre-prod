import { describe, expect, it } from "vitest";
import { dateValide, texteOptionnel } from "./commun";

describe("texteOptionnel", () => {
  it.each(["", "   ", "\t\n"])("normalise un texte vide en null", (valeur) => expect(texteOptionnel().parse(valeur)).toBeNull());
  it("conserve undefined, null et un texte nettoyé", () => {
    expect(texteOptionnel().parse(undefined)).toBeUndefined();
    expect(texteOptionnel().parse(null)).toBeNull();
    expect(texteOptionnel().parse(" RIS ")).toBe("RIS");
  });
  it("borne la longueur après trim", () => {
    expect(texteOptionnel(3).parse(" abc ")).toBe("abc");
    expect(texteOptionnel(3).safeParse("abcd").success).toBe(false);
  });
});

describe("dateValide : formats acceptés", () => {
  it("un jour seul, lu à minuit UTC", () => {
    expect(dateValide.parse("2026-11-18")).toEqual(new Date("2026-11-18T00:00:00.000Z"));
    expect(dateValide.parse("2026-01-01")).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(dateValide.parse("2026-12-31")).toEqual(new Date(Date.UTC(2026, 11, 31)));
  });
  it("le 29 février d'une année bissextile", () => expect(dateValide.parse("2028-02-29")).toEqual(new Date(Date.UTC(2028, 1, 29))));
  it("un ISO complet avec heure et Z, tel que le produit toISOString", () => {
    expect(dateValide.parse("2026-11-18T10:00:00.000Z")).toEqual(new Date(Date.UTC(2026, 10, 18, 10)));
    expect(dateValide.parse("2026-11-18T10:00:00Z")).toEqual(new Date(Date.UTC(2026, 10, 18, 10)));
    expect(dateValide.parse("2026-11-18T10:00Z")).toEqual(new Date(Date.UTC(2026, 10, 18, 10)));
    const maintenant = new Date();
    expect(dateValide.parse(maintenant.toISOString())).toEqual(maintenant);
  });
  it("un ISO avec décalage", () => {
    expect(dateValide.parse("2026-11-18T10:00:00+01:00")).toEqual(new Date(Date.UTC(2026, 10, 18, 9)));
    expect(dateValide.parse("2026-11-18T10:00:00.500-05:00")).toEqual(new Date(Date.UTC(2026, 10, 18, 15, 0, 0, 500)));
  });
  it("une heure sans fuseau reste lisible", () => expect(dateValide.safeParse("2026-11-18T10:00:00").success).toBe(true));
});

describe("dateValide : refus", () => {
  it.each([
    "2027-02-29", "2026-02-30", "2026-04-31", "2026-02-29T10:00:00Z", "2100-02-29", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32",
    "1", "Nov 18 2026", "18/11/2026", "2026/11/18", "2026-1-5", "26-11-18", "20261118", "2026-11", "2026",
    "", "   ", " 2026-11-18", "2026-11-18 ", "2026-11-18 10:00", "2026-11-18T10", "2026-11-18T25:00:00Z", "2026-11-18T10:61:00Z", "2026-11-18T10:00:00Zjunk",
    "pas une date", "undefined", "NaN",
  ])("refuse %j", (valeur) => {
    const analyse = dateValide.safeParse(valeur);
    expect(analyse.success).toBe(false);
    if (!analyse.success) expect(analyse.error.issues[0].message).toBe("Date invalide.");
  });
  it.each([20261118, null, undefined, true, [], {}, new Date("2026-11-18")])("refuse ce qui n'est pas une chaîne : %j", (valeur) =>
    expect(dateValide.safeParse(valeur).success).toBe(false));
  it("se combine avec nullable et optional comme dans les schémas du dépôt", () => {
    expect(dateValide.nullable().optional().parse(null)).toBeNull();
    expect(dateValide.nullable().optional().parse(undefined)).toBeUndefined();
    expect(dateValide.nullable().optional().safeParse("2027-02-29").success).toBe(false);
  });
});

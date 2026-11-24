import { describe, expect, it } from "vitest";
import { DROITS, PROFILS, droitsEffectifs, estAdministrateurPilot, libelleCompte, normaliser, profilEffectif, refusDroits, type Droit } from "./droits";

const tous = DROITS.map((d) => d.cle);
const acces = (profil: "DEVELOPPEUR" | "GERANT", droits: Droit[], retireLe: Date | null = null) => ({ profil, droits, retireLe });

describe("droitsEffectifs", () => {
  it("le super-administrateur a tous les droits, sans ligne d'accès", () => {
    expect(droitsEffectifs("SUPER_ADMIN", null)).toEqual(tous);
  });
  it("un client ou un rôle inconnu n'a aucun droit", () => {
    expect(droitsEffectifs("CLIENT", acces("GERANT", tous))).toEqual([]);
    expect(droitsEffectifs("INCONNU", null)).toEqual([]);
  });
  it("un compte ADMIN sans ligne est un développeur aux droits par défaut", () => {
    expect(droitsEffectifs("ADMIN", null)).toEqual(PROFILS.DEVELOPPEUR.parDefaut);
    expect(profilEffectif("ADMIN", null)).toBe("DEVELOPPEUR");
  });
  it("un gérant a ce qui est coché, rien de plus", () => {
    expect(droitsEffectifs("ADMIN", acces("GERANT", ["MODIFIER_MONTANTS"]))).toEqual(["MODIFIER_MONTANTS"]);
    expect(droitsEffectifs("ADMIN", acces("GERANT", tous))).toEqual(tous);
  });
  it("un développeur ne voit jamais le chiffre d'affaires, même stocké coché", () => {
    const droits = droitsEffectifs("ADMIN", acces("DEVELOPPEUR", tous));
    expect(droits).not.toContain("VOIR_CA");
    expect(droits).not.toContain("EXPORTER_CA");
    expect(droits).toContain("MODIFIER_MONTANTS");
  });
  it("l'export sans la vue du chiffre d'affaires est ignoré", () => {
    expect(droitsEffectifs("ADMIN", acces("GERANT", ["EXPORTER_CA"]))).toEqual([]);
  });
  it("un accès retiré n'a plus aucun droit", () => {
    expect(droitsEffectifs("ADMIN", acces("GERANT", tous, new Date()))).toEqual([]);
  });
});

describe("refusDroits", () => {
  it("refuse le chiffre d'affaires à un développeur, et dit pourquoi", () => {
    expect(refusDroits("DEVELOPPEUR", ["VOIR_CA"])).toBe("Un développeur ne voit pas le chiffre d'affaires.");
    expect(refusDroits("DEVELOPPEUR", ["EXPORTER_CA"])).toBe("Un développeur ne voit pas le chiffre d'affaires.");
  });
  it("refuse l'export sans la vue", () => {
    expect(refusDroits("GERANT", ["EXPORTER_CA"])).toBe("L'export demande de voir le chiffre d'affaires.");
  });
  it("accepte les droits par défaut de chaque rôle", () => {
    for (const profil of ["DEVELOPPEUR", "GERANT"] as const) expect(refusDroits(profil, PROFILS[profil].parDefaut)).toBeNull();
    expect(refusDroits("GERANT", [])).toBeNull();
  });
});

it("normaliser ordonne, dédoublonne et écarte l'inconnu", () => {
  expect(normaliser(["EVALUER_PARC", "VOIR_CA", "VOIR_CA", "INCONNU"])).toEqual(["VOIR_CA", "EVALUER_PARC"]);
});

it("libelleCompte nomme les trois rôles", () => {
  expect(libelleCompte("SUPER_ADMIN", null)).toBe("Super-administrateur");
  expect(libelleCompte("ADMIN", "GERANT")).toBe("Gérant");
  expect(libelleCompte("ADMIN", null)).toBe("Développeur");
  expect(libelleCompte("CLIENT", null)).toBe("Client");
});

describe("administrateur de Pilot (24/11/2026)", () => {
  const admin = (retireLe: Date | null = null) => ({ ...acces("DEVELOPPEUR", [], retireLe), administrateur: true });
  it("a tous les droits de Pilot, quel que soit son rôle coché", () => {
    expect(estAdministrateurPilot("ADMIN", admin())).toBe(true);
    expect(droitsEffectifs("ADMIN", admin())).toEqual(tous);
    expect(libelleCompte("ADMIN", "GERANT", true)).toBe("Administrateur de Pilot");
  });
  it("perd tout quand son accès est retiré, et la case ne vaut rien hors d'un compte ADMIN", () => {
    expect(estAdministrateurPilot("ADMIN", admin(new Date()))).toBe(false);
    expect(droitsEffectifs("ADMIN", admin(new Date()))).toEqual([]);
    expect(estAdministrateurPilot("CLIENT", admin())).toBe(false);
    expect(droitsEffectifs("CLIENT", admin())).toEqual([]);
  });
});

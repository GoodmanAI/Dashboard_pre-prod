import { describe, expect, it } from "vitest";
import { hacherMotDePasse, motDePasseProvisoire, verifierMotDePasse } from "./motDePasse";
import { LONGUEUR_MOT_DE_PASSE } from "./validation/acces";

describe("mots de passe (bcrypt du Dashboard)", () => {
  it("accepte le bon mot, refuse un autre", async () => {
    const stocke = await hacherMotDePasse("Essai-local-42");
    expect(stocke).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifierMotDePasse("Essai-local-42", stocke)).toBe(true);
    expect(await verifierMotDePasse("essai-local-42", stocke)).toBe(false);
  });
  it("deux hachages du même mot diffèrent (sel aléatoire)", async () => {
    expect(await hacherMotDePasse("x")).not.toBe(await hacherMotDePasse("x"));
  });
  it("refuse tout ce qui n'est pas une empreinte bcrypt", async () => {
    for (const stocke of ["non-utilise-en-local", "", "scrypt$", "scrypt$abcd$1234", "bcrypt$a$b", "$2b$"]) {
      expect(await verifierMotDePasse("non-utilise-en-local", stocke)).toBe(false);
    }
  });
});

describe("mot de passe provisoire (C-64)", () => {
  it("trois groupes de cinq signes sans caractère ambigu", () => {
    const mot = motDePasseProvisoire();
    expect(mot).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{5}-[a-km-np-zA-HJ-NP-Z2-9]{5}-[a-km-np-zA-HJ-NP-Z2-9]{5}$/);
    expect(mot.length).toBeGreaterThanOrEqual(LONGUEUR_MOT_DE_PASSE.min);
  });
  it("change à chaque tirage", () => {
    expect(new Set(Array.from({ length: 50 }, motDePasseProvisoire)).size).toBe(50);
  });
});

import { describe, expect, it } from "vitest";
import { adresseDeConnexion, raisonDeRefus } from "./refusSession";

describe("adresseDeConnexion", () => {
  it("renvoie une page vers la connexion du Dashboard, avec son adresse et la raison", () => {
    const adresse = adresseDeConnexion("/pilot/comptes?vue=equipe", "session");
    const url = new URL(adresse!, "http://localhost");
    expect(url.pathname).toBe("/authentication/signin");
    expect(url.searchParams.get("callbackUrl")).toBe("/pilot/comptes?vue=equipe");
    expect(url.searchParams.get("raison")).toBe("session");
  });
  it("laisse une API répondre 401", () => {
    expect(adresseDeConnexion("/api/pilot/alertes", "session")).toBeNull();
  });
  it("laisse répondre 401 quand le chemin est inconnu", () => {
    expect(adresseDeConnexion(null, "acces")).toBeNull();
  });
});

describe("raisonDeRefus", () => {
  it("ne reconnaît que les deux raisons prévues", () => {
    expect(raisonDeRefus("session")).toBe("session");
    expect(raisonDeRefus("acces")).toBe("acces");
    expect(raisonDeRefus("<script>")).toBeNull();
    expect(raisonDeRefus(null)).toBeNull();
  });
});

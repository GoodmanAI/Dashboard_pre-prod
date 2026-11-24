import { describe, expect, it } from "vitest";
import { ErreurMetier } from "./erreurs";
import { CORPS_MAXIMUM, lireCorps, lireJsonBorne, MESSAGE_CORPS_TROP_GROS, origineDe, origineRefusee, tailleAnnonceeDepasse } from "./requete";

describe("origine des requêtes qui modifient (lot T)", () => {
  const PILOT = "http://localhost:3100";
  const cas = (methode: string, origine: string | null, chemin = "/api/pilot/organisations/1/commentaires") =>
    origineRefusee({ methode, chemin, origine, attendues: [PILOT] });

  it("refuse une requête qui modifie venue d'une autre origine", () => {
    for (const methode of ["POST", "PATCH", "PUT", "DELETE", "post"]) expect(cas(methode, "https://site-tiers.example")).toBe(true);
    expect(cas("POST", "http://localhost:3101")).toBe(true);
    expect(cas("POST", "https://localhost:3100")).toBe(true);
    expect(cas("POST", "null")).toBe(true);
  });
  it("laisse passer la même origine, à la casse près", () => {
    expect(cas("POST", PILOT)).toBe(false);
    expect(cas("DELETE", "http://LOCALHOST:3100")).toBe(false);
  });
  it("laisse passer une requête sans en-tête Origin : scripts et outils", () => {
    expect(cas("POST", null)).toBe(false);
  });
  it("ne contrôle ni GET ni HEAD", () => {
    expect(cas("GET", "https://site-tiers.example")).toBe(false);
    expect(cas("HEAD", "https://site-tiers.example")).toBe(false);
  });
  it("ne contrôle que les API", () => {
    expect(cas("POST", "https://site-tiers.example", "/pilot/organisations/1")).toBe(false);
  });
  it("accepte l'une des origines attendues, ignore les vides", () => {
    expect(origineRefusee({ methode: "POST", chemin: "/api/pilot/x", origine: "https://pilot.lyrae.example", attendues: [null, undefined, "", "http://interne:3000", "https://pilot.lyrae.example"] })).toBe(false);
    expect(origineRefusee({ methode: "POST", chemin: "/api/pilot/x", origine: "https://pilot.lyrae.example", attendues: [null, ""] })).toBe(true);
  });
});

describe("origine déduite des en-têtes", () => {
  it("assemble protocole et hôte, en prenant la première valeur d'une liste", () => {
    expect(origineDe("https", "pilot.lyrae.example")).toBe("https://pilot.lyrae.example");
    expect(origineDe("http:", "localhost:3100")).toBe("http://localhost:3100");
    expect(origineDe("https, http", "a.example, b.example")).toBe("https://a.example");
  });
  it("rend null s'il manque un morceau ou si l'hôte est étrange", () => {
    expect(origineDe(null, "a.example")).toBeNull();
    expect(origineDe("https", null)).toBeNull();
    expect(origineDe("ftp", "a.example")).toBeNull();
    expect(origineDe("https", "a.example/chemin")).toBeNull();
  });
});

describe("corps borné (lot T)", () => {
  const MAX = 64 * 1024;
  const requete = (corps: BodyInit, entetes: Record<string, string> = {}) =>
    new Request("http://localhost/api/pilot/organisations/1/commentaires", { method: "POST", body: corps, headers: entetes, duplex: "half" } as RequestInit);

  it("lit la taille annoncée", () => {
    expect(tailleAnnonceeDepasse(null, MAX)).toBe(false);
    expect(tailleAnnonceeDepasse("65536", MAX)).toBe(false);
    expect(tailleAnnonceeDepasse("65537", MAX)).toBe(true);
    expect(tailleAnnonceeDepasse("abc", MAX)).toBe(false);
  });
  it("refuse en 413 un Content-Length trop grand, sans lire le corps", async () => {
    const erreur = await lireJsonBorne(requete("{}", { "content-length": String(MAX + 1) }), MAX).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurMetier);
    expect((erreur as ErreurMetier).statut).toBe(413);
    expect((erreur as ErreurMetier).message).toBe("Commentaire trop long.");
  });
  it("arrête la lecture d'un flux sans longueur annoncée dès qu'il dépasse", async () => {
    const flux = new ReadableStream<Uint8Array>({
      start(c) { for (let i = 0; i < 10; i += 1) c.enqueue(new Uint8Array(10 * 1024).fill(32)); c.close(); },
    });
    const erreur = await lireJsonBorne(requete(flux), MAX).catch((e: unknown) => e);
    expect((erreur as ErreurMetier).statut).toBe(413);
  });
  it("rend le JSON d'un corps raisonnable, null pour un corps illisible", async () => {
    expect(await lireJsonBorne(requete(JSON.stringify({ texte: "Bonjour é \u{1F600}" })), MAX)).toEqual({ texte: "Bonjour é \u{1F600}" });
    expect(await lireJsonBorne(requete("pas du json"), MAX)).toBeNull();
  });
});

describe("corps borné des routes à texte libre : une seule limite", () => {
  const requete = (corps: string) => new Request("http://localhost/api/pilot/concurrents", { method: "POST", body: corps });
  it("la limite partagée vaut 64 Kio", () => expect(CORPS_MAXIMUM).toBe(64 * 1024));
  it("refuse en 413 un corps de plus de 64 Kio, avec un message qui dit quoi faire", async () => {
    const erreur = await lireCorps(requete(JSON.stringify({ notes: "a".repeat(CORPS_MAXIMUM) }))).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurMetier);
    expect((erreur as ErreurMetier).statut).toBe(413);
    expect((erreur as ErreurMetier).message).toBe(MESSAGE_CORPS_TROP_GROS);
  });
  it("lit un corps raisonnable, et rend null pour un corps illisible ou vide", async () => {
    expect(await lireCorps(requete(JSON.stringify({ nom: "Robot" })))).toEqual({ nom: "Robot" });
    expect(await lireCorps(requete("{"))).toBeNull();
    expect(await lireCorps(requete(""))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { annuaireActif, chercherDansAnnuaire, lireEntreprise, type Appel } from "./service";

const etab = (siret: string, siege = false) => ({ siret, adresse: "1 RUE A 29000 QUIMPER", code_postal: "29000", libelle_commune: "QUIMPER", etat_administratif: "A", est_siege: siege });
const entreprise = (avecEtablissements: boolean) => ({
  siren: "123456789", nom_complet: "IMAGERIE TEST", nom_raison_sociale: "IMAGERIE TEST", nombre_etablissements_ouverts: 3,
  siege: etab("12345678900011", true), matching_etablissements: avecEtablissements ? [etab("12345678900029"), etab("12345678900037")] : [],
});

describe("appels à l'annuaire (C-89)", () => {
  it("coupé pendant les tests et avec PILOT_ANNUAIRE=0", () => {
    expect(annuaireActif({ NODE_ENV: "test" })).toBe(false);
    expect(annuaireActif({ NODE_ENV: "production", PILOT_ANNUAIRE: "0" })).toBe(false);
    expect(annuaireActif({ NODE_ENV: "production" })).toBe(true);
  });

  it("sans résultat pour le nom, se replie sur un mot porteur dans la santé, et le dit", async () => {
    const vus: URLSearchParams[] = [];
    const appel: Appel = async (p) => { vus.push(p); return { results: p.get("section_activite_principale") === "Q" ? [entreprise(false)] : [] }; };
    const r = await chercherDansAnnuaire("SELARL Imagerie Kerfeunteun", appel);
    expect(r.entreprises).toHaveLength(1);
    expect(r.note).toContain("Kerfeunteun");
    expect(vus[1].get("q")).toBe("Kerfeunteun");
  });

  it("refuse une recherche trop courte", async () => {
    await expect(chercherDansAnnuaire(" a ", async () => ({ results: [] }))).rejects.toThrow("Saisissez");
  });

  it("relit une entreprise par son nom quand le SIREN ne liste pas ses établissements", async () => {
    const appel: Appel = async (p) => ({ results: [entreprise(p.get("q") !== "123456789")] });
    const e = await lireEntreprise("123456789", appel);
    expect(e.etablissements.map((x) => x.siret)).toEqual(["12345678900011", "12345678900029", "12345678900037"]);
  });
});

import { describe, expect, it } from "vitest";
import { deplacer, lienCreation, lienResultat, listerOptions, requetePropre } from "./navigation";

const vide = { organisations: [], contacts: [], centres: [] };
const r = (id: number, organisationId: number, libelle: string) => ({ id, organisationId, libelle, secondaire: "" });

describe("requetePropre", () => {
  it("réduit les espaces et exige deux lettres", () => {
    expect(requetePropre("  al   pha ")).toEqual({ propre: "al pha", valide: true });
    expect(requetePropre(" a ").valide).toBe(false);
    expect(requetePropre("").valide).toBe(false);
  });
  it("refuse plus de quatre-vingts caractères", () => {
    expect(requetePropre("a".repeat(80)).valide).toBe(true);
    expect(requetePropre("a".repeat(81)).valide).toBe(false);
  });
});

describe("liens", () => {
  it("ouvre la fiche, avec l'onglet pour un contact ou un centre", () => {
    expect(lienResultat("organisations", 7)).toBe("/pilot/organisations/7");
    expect(lienResultat("contacts", 7)).toBe("/pilot/organisations/7?onglet=contacts");
    expect(lienResultat("centres", 7)).toBe("/pilot/organisations/7?onglet=centres");
  });
  it("encode le nom à créer", () => {
    expect(lienCreation("Cabinet A&B")).toBe("/pilot/organisations/nouveau?nom=Cabinet%20A%26B");
  });
});

describe("listerOptions", () => {
  it("garde l'ordre clients, contacts, centres", () => {
    const options = listerOptions({ organisations: [r(1, 1, "Alpha")], contacts: [r(2, 1, "Anne")], centres: [r(3, 1, "Site principal")] }, "a", true);
    expect(options.map((o) => o.cle)).toEqual(["organisations-1", "contacts-2", "centres-3"]);
    expect(options[1]!.lien).toBe("/pilot/organisations/1?onglet=contacts");
  });
  it("sépare deux identifiants égaux de groupes différents", () => {
    const options = listerOptions({ organisations: [r(1, 1, "A")], contacts: [r(1, 1, "B")], centres: [] }, "a", false);
    expect(new Set(options.map((o) => o.cle)).size).toBe(2);
  });
  it("propose la création quand rien ne correspond", () => {
    const options = listerOptions(vide, "Alpha", true);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ groupe: "creation", libelle: "Créer le prospect « Alpha »", lien: "/pilot/organisations/nouveau?nom=Alpha" });
  });
  it("ne propose pas la création pendant la recherche ou en erreur", () => {
    expect(listerOptions(vide, "Alpha", false)).toEqual([]);
  });
  it("ne propose pas la création quand il y a des résultats", () => {
    expect(listerOptions({ ...vide, organisations: [r(1, 1, "Alpha")] }, "Alpha", true).map((o) => o.groupe)).toEqual(["organisations"]);
  });
});

describe("deplacer", () => {
  it("descend et boucle en bas", () => {
    expect(deplacer(0, 3, 1)).toBe(1);
    expect(deplacer(2, 3, 1)).toBe(0);
  });
  it("monte et boucle en haut", () => {
    expect(deplacer(2, 3, -1)).toBe(1);
    expect(deplacer(0, 3, -1)).toBe(2);
  });
  it("reste sur 0 avec une seule ligne ou aucune", () => {
    expect(deplacer(0, 1, 1)).toBe(0);
    expect(deplacer(0, 1, -1)).toBe(0);
    expect(deplacer(5, 0, 1)).toBe(0);
  });
  it("ramène un index hors limites dans la liste", () => {
    expect(deplacer(9, 3, 1)).toBe(0);
    expect(deplacer(-1, 3, 1)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  GENRES_PREVENIR, aideGenre, calculerCibles, libelleOptionDepartement, libelleOptionPersonne, libelleOptionTous, raisonGenreImpossible,
} from "./cibles";
import type { CompteEquipe } from "./destinataires";

const compte = (id: number, role: string, departement: CompteEquipe["departement"], accesRetire = false, nom: string | null = `Compte ${id}`): CompteEquipe =>
  ({ id, nom, role, departement, accesRetire });

const EQUIPE = [
  compte(1, "ADMIN", "COMMERCIAL", false, "Commercial A"),
  compte(2, "ADMIN", "COMMERCIAL", false, "Commercial B"),
  compte(3, "ADMIN", "PROJET", false, "Projet A"),
  compte(4, "SUPER_ADMIN", "DIRECTION", false, "Direction"),
  compte(5, "ADMIN", null, false, "Sans département"),
  compte(6, "ADMIN", "PROJET", true, "Ancien"),
  compte(7, "CLIENT", null, false, "Client"),
];

describe("calculerCibles", () => {
  const cibles = calculerCibles(EQUIPE, 1);
  it("liste les comptes actifs sans l'auteur, ni les accès retirés, ni les clients, par ordre alphabétique", () => {
    expect(cibles.personnes.map((p) => p.nom)).toEqual(["Commercial B", "Direction", "Projet A", "Sans département"]);
  });
  it("compte chaque département sans l'auteur ni les accès retirés, dans l'ordre de l'écran", () => {
    expect(cibles.departements).toEqual([
      { departement: "COMMERCIAL", nombre: 1 }, { departement: "PROJET", nombre: 1 },
      { departement: "TECHNIQUE", nombre: 0 }, { departement: "DIRECTION", nombre: 1 },
    ]);
  });
  it("compte tout le monde sans l'auteur", () => {
    expect(cibles.tous).toBe(4);
  });
  it("rend tout vide quand l'auteur est seul", () => {
    const seul = calculerCibles([compte(1, "ADMIN", "PROJET")], 1);
    expect(seul.personnes).toEqual([]);
    expect(seul.tous).toBe(0);
    expect(seul.departements.every((d) => d.nombre === 0)).toBe(true);
  });
  it("nomme un compte sans nom", () => {
    expect(calculerCibles([compte(1, "ADMIN", null), compte(2, "ADMIN", null, false, null)], 1).personnes).toEqual([{ id: 2, nom: "Sans nom", departement: null }]);
  });
});

describe("libellés des options", () => {
  it("dit le nombre de personnes d'un département, ou qu'il est vide", () => {
    expect(libelleOptionDepartement({ departement: "PROJET", nombre: 1 })).toBe("Projet, 1 personne");
    expect(libelleOptionDepartement({ departement: "COMMERCIAL", nombre: 3 })).toBe("Commercial, 3 personnes");
    expect(libelleOptionDepartement({ departement: "TECHNIQUE", nombre: 0 })).toBe("Technique, personne d'autre pour l'instant");
  });
  it("dit combien de personnes toute l'équipe réunit", () => {
    expect(libelleOptionTous(4)).toBe("Tout le monde, 4 personnes");
    expect(libelleOptionTous(0)).toBe("Tout le monde, personne d'autre pour l'instant");
  });
  it("joint le département d'une personne quand il est choisi", () => {
    expect(libelleOptionPersonne({ id: 2, nom: "Commercial B", departement: "COMMERCIAL" })).toBe("Commercial B, département Commercial");
    expect(libelleOptionPersonne({ id: 5, nom: "Sans département", departement: null })).toBe("Sans département");
  });
});

describe("genres de cible", () => {
  it("propose les quatre genres, dans l'ordre du sélecteur", () => {
    expect(GENRES_PREVENIR.map((g) => g.libelle)).toEqual(["Personne", "Tout le monde", "Un département", "Une personne"]);
  });
  it("accepte tout genre quand l'équipe est là", () => {
    for (const g of GENRES_PREVENIR) expect(raisonGenreImpossible(g.valeur, calculerCibles(EQUIPE, 1))).toBeNull();
  });
  it("refuse, avec sa raison, une alerte que le serveur refuserait", () => {
    const seul = calculerCibles([compte(1, "ADMIN", "PROJET")], 1);
    expect(raisonGenreImpossible("AUCUN", seul)).toBeNull();
    expect(raisonGenreImpossible("TOUS", seul)).toBe("Personne d'autre n'est dans l'équipe.");
    expect(raisonGenreImpossible("PERSONNE", seul)).toBe("Personne d'autre n'est dans l'équipe.");
    expect(raisonGenreImpossible("DEPARTEMENT", seul)).toContain("Aucun département");
  });
  it("explique chaque genre", () => {
    for (const g of GENRES_PREVENIR) expect(aideGenre(g.valeur).length).toBeGreaterThan(10);
  });
});

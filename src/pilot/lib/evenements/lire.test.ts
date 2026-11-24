import { describe, expect, it } from "vitest";
import { filtresApres, fusionnerChronologie, lireCurseur, type EchangeChronologique, type EvenementChronologique } from "./lire";

const date = (jour: number) => new Date(Date.UTC(2026, 9, jour));
const echange = (id: number, jour: number): EchangeChronologique => ({
  id, type: "APPEL", surveneuLe: date(jour), compteRendu: "Compte rendu",
  statut: "REALISE", prochaineActionFaiteLe: null,
  prochaineAction: null, prochaineActionLe: null, contact: { nom: "Contact de test" },
  auteur: { name: "Direction" },
});
const evenement = (id: number, jour: number, type: EvenementChronologique["type"] = "ETAPE_COMMERCIALE_CHANGEE"): EvenementChronologique => ({
  id, type, surveneuLe: date(jour), resume: "Étape changée", auteurId: null, auteur: null,
});

describe("fusionnerChronologie", () => {
  it("trie les deux sources par date décroissante puis id décroissant", () => {
    const resultat = fusionnerChronologie([echange(1, 24), echange(8, 26)], [evenement(3, 26), evenement(2, 25)], 50);
    expect(resultat.elements.map((e) => e.id)).toEqual([8, 3, 2, 1]);
    expect(resultat.elements.map((e) => e.nature)).toEqual(["echange", "evenement", "evenement", "echange"]);
    expect(resultat.elements[0]).toMatchObject({ contact: "Contact de test", auteur: "Direction" });
    expect(resultat.suite).toBe(false);
    expect(resultat.curseur).toBeNull();
  });
  it("exclut les deux types ECHANGE même quand ils sont les plus récents", () => {
    const resultat = fusionnerChronologie([echange(1, 24)], [
      evenement(2, 26, "ECHANGE_SAISI"), evenement(3, 25, "ECHANGE_MODIFIE"),
    ], 1);
    expect(resultat.elements.map((e) => e.id)).toEqual([1]);
    expect(resultat.suite).toBe(false);
  });
  it("exclut les commentaires écrits (le fil les montre) et garde la trace d'une suppression", () => {
    const resultat = fusionnerChronologie([], [
      evenement(3, 26, "COMMENTAIRE_ECRIT"), evenement(2, 25, "COMMENTAIRE_SUPPRIME"), evenement(1, 24),
    ], 50);
    expect(resultat.elements.map((e) => e.id)).toEqual([2, 1]);
  });
  it("coupe à la limite et fournit un curseur date, nature et id", () => {
    const resultat = fusionnerChronologie([echange(4, 26), echange(1, 23)], [evenement(3, 25), evenement(2, 24)], 2);
    expect(resultat.elements.map((e) => e.id)).toEqual([4, 3]);
    expect(resultat.suite).toBe(true);
    expect(resultat.curseur).toBe(`${date(25).toISOString()}~evenement~3`);
  });
  it("à date égale, place l'échange avant l'événement, puis l'id décroissant", () => {
    const resultat = fusionnerChronologie([echange(2, 26), echange(9, 26)], [evenement(50, 26)], 50);
    expect(resultat.elements.map((e) => `${e.nature}-${e.id}`)).toEqual(["echange-9", "echange-2", "evenement-50"]);
  });
  it("n'annonce pas de suite quand la taille égale la limite", () => {
    expect(fusionnerChronologie([], [evenement(1, 25)], 1)).toMatchObject({ suite: false, curseur: null });
  });
  it("renvoie une liste vide sans curseur", () => {
    expect(fusionnerChronologie([], [], 50)).toEqual({ elements: [], suite: false, curseur: null });
  });
});

describe("curseur", () => {
  it("relit ce qu'il écrit et refuse le reste", () => {
    expect(lireCurseur(`${date(25).toISOString()}~echange~7`)).toEqual({ surveneuLe: date(25), nature: "echange", id: 7 });
    for (const faux of ["", "2026-10-25", `${date(25).toISOString()}~autre~7`, `${date(25).toISOString()}~echange~0`, "pas~echange~3"]) {
      expect(lireCurseur(faux)).toBeNull();
    }
  });
  it("ne perd aucun échange du même minuit entre deux pages", () => {
    // Trois échanges du même jour, page de deux : le curseur tombe sur le deuxième.
    const page = fusionnerChronologie([echange(3, 26), echange(2, 26), echange(1, 26)], [], 2);
    const curseur = lireCurseur(page.curseur!)!;
    expect(filtresApres(curseur).echanges).toEqual({
      OR: [{ surveneuLe: { lt: date(26) } }, { surveneuLe: date(26), id: { lt: 2 } }],
    });
  });
  it("après un événement, les échanges du même instant sont déjà affichés", () => {
    const f = filtresApres({ surveneuLe: date(26), nature: "evenement", id: 5 });
    expect(f.echanges).toEqual({ surveneuLe: { lt: date(26) } });
    expect(f.evenements).toEqual({ OR: [{ surveneuLe: { lt: date(26) } }, { surveneuLe: date(26), id: { lt: 5 } }] });
  });
  it("après un échange, tous les événements du même instant restent à afficher", () => {
    expect(filtresApres({ surveneuLe: date(26), nature: "echange", id: 5 }).evenements).toEqual({ surveneuLe: { lte: date(26) } });
  });
});

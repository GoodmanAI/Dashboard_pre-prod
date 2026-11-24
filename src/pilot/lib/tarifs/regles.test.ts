import { describe, expect, it } from "vitest";
import {
  MESSAGE_DERNIER_TARIF, MESSAGE_DOUBLON_CODE, MESSAGE_DOUBLON_DATE, MESSAGE_GRILLE_VIDE_AUJOURDHUI, MESSAGE_SUPPRESSION_GRILLE, classerGrilles, messageDateGrille, messageGrilleUtilisee,
  messageGrilleVide, messageRetraitTarif, messageSuppressionGrille, ordreSuivant, peutChangerLaDate, resumerGrille,
} from "./regles";

const jour = (s: string) => new Date(`${s}T00:00:00Z`);
const MAINTENANT = new Date("2026-11-18T14:30:00Z");

describe("classerGrilles : en vigueur, passées, prochaines", () => {
  const grilles = [
    { id: 1, applicableLe: jour("2026-01-01") }, { id: 2, applicableLe: jour("2026-06-01") },
    { id: 3, applicableLe: jour("2026-11-18") }, { id: 4, applicableLe: jour("2027-01-01") }, { id: 5, applicableLe: jour("2026-12-01") },
  ];
  it("la plus récente qui ne dépasse pas l'instant est en vigueur, une grille datée du jour comprise", () => {
    expect(Object.fromEntries(classerGrilles(grilles, MAINTENANT).map((g) => [g.id, g.statut]))).toEqual({
      1: "PASSEE", 2: "PASSEE", 3: "EN_VIGUEUR", 4: "PROCHAINE", 5: "PROCHAINE",
    });
  });
  it("sans grille datée du jour ou avant, aucune n'est en vigueur : jamais une grille future promue", () => {
    expect(classerGrilles([{ id: 9, applicableLe: jour("2026-11-19") }], MAINTENANT).map((g) => g.statut)).toEqual(["PROCHAINE"]);
  });
  it("trie du plus lointain au plus ancien, et garde les champs de la grille", () => {
    const r = classerGrilles(grilles, MAINTENANT);
    expect(r.map((g) => g.id)).toEqual([4, 5, 3, 2, 1]);
    expect(r[0]).toMatchObject({ id: 4, applicableLe: jour("2027-01-01") });
  });
  it("la veille à 23 h 59 d'un jour d'application, la grille n'est pas encore en vigueur", () => {
    const veille = new Date("2026-11-17T23:59:59.999Z");
    expect(classerGrilles(grilles, veille).find((g) => g.id === 3)?.statut).toBe("PROCHAINE");
    expect(classerGrilles(grilles, veille).find((g) => g.id === 2)?.statut).toBe("EN_VIGUEUR");
  });
  it("une liste vide reste vide", () => expect(classerGrilles([], MAINTENANT)).toEqual([]));
});

describe("la date d'une grille : aujourd'hui ou plus tard", () => {
  it("accepte aujourd'hui, à n'importe quelle heure, et le futur", () => {
    expect(messageDateGrille(jour("2026-11-18"), MAINTENANT)).toBeNull();
    expect(messageDateGrille(jour("2026-11-18"), new Date("2026-11-18T23:59:59Z"))).toBeNull();
    expect(messageDateGrille(jour("2027-03-01"), MAINTENANT)).toBeNull();
  });
  it("refuse hier : une date passée changerait la grille que les anciennes lectures ont vue", () => {
    expect(messageDateGrille(jour("2026-11-17"), MAINTENANT)).toBe("Une grille s'applique à partir d'aujourd'hui ou plus tard. Choisissez une date à venir.");
  });
});

describe("une grille utilisée ne change plus", () => {
  it("rien à dire tant qu'aucune proposition ne l'utilise", () => expect(messageGrilleUtilisee(0)).toBeNull());
  it("dit combien de propositions, au singulier et au pluriel", () => {
    expect(messageGrilleUtilisee(1)).toBe("Cette grille sert déjà à 1 proposition. Créez une nouvelle grille datée pour changer un prix.");
    expect(messageGrilleUtilisee(3)).toBe("Cette grille sert déjà à 3 propositions. Créez une nouvelle grille datée pour changer un prix.");
  });
  it("refuse un compte invalide plutôt que de le taire", () => {
    expect(() => messageGrilleUtilisee(-1)).toThrow();
    expect(() => messageGrilleUtilisee(1.5)).toThrow();
  });
});

describe("la date ne change que pour une grille à venir", () => {
  it.each([["PROCHAINE", true], ["EN_VIGUEUR", false], ["PASSEE", false]] as const)("%s : %s", (statut, attendu) => expect(peutChangerLaDate(statut)).toBe(attendu));
});

describe("l'ordre d'un nouveau tarif", () => {
  it("suit le plus grand ordre, de dix en dix", () => {
    expect(ordreSuivant([])).toBe(10);
    expect(ordreSuivant([10, 20, 70])).toBe(80);
    expect(ordreSuivant([0])).toBe(10);
  });
  it("ne dépasse pas la borne de la validation", () => expect(ordreSuivant([10000])).toBe(10000));
});

describe("le résumé d'une grille pour l'écran", () => {
  it("une grille jamais utilisée est modifiable", () => {
    expect(resumerGrille("EN_VIGUEUR", 0)).toMatchObject({ statut: "EN_VIGUEUR", nombrePropositions: 0, modifiable: true, raison: null, dateModifiable: false });
  });
  it("une grille utilisée ne l'est plus et dit pourquoi", () => {
    const r = resumerGrille("PASSEE", 2);
    expect(r).toMatchObject({ nombrePropositions: 2, modifiable: false, dateModifiable: false });
    expect(r.raison).toBe("Cette grille sert déjà à 2 propositions. Créez une nouvelle grille datée pour changer un prix.");
  });
  it("seule une grille à venir et inutilisée change de date", () => {
    expect(resumerGrille("PROCHAINE", 0).dateModifiable).toBe(true);
    expect(resumerGrille("PROCHAINE", 1).dateModifiable).toBe(false);
  });
});

describe("une grille vide n'entre pas en vigueur le jour même", () => {
  it("vide et datée d'aujourd'hui : refusée, avec quoi faire", () => {
    expect(messageGrilleVide(jour("2026-11-18"), 0, MAINTENANT)).toBe(MESSAGE_GRILLE_VIDE_AUJOURDHUI);
    expect(MESSAGE_GRILLE_VIDE_AUJOURDHUI).toMatch(/Reprenez les tarifs d'une grille, ou choisissez un jour à venir\.$/);
  });
  it("vide et à venir, ou datée d'aujourd'hui avec des tarifs : acceptée", () => {
    expect(messageGrilleVide(jour("2026-11-19"), 0, MAINTENANT)).toBeNull();
    expect(messageGrilleVide(jour("2026-11-18"), 1, MAINTENANT)).toBeNull();
  });
  it("le jour est celui d'UTC, comme les dates d'application", () => {
    expect(messageGrilleVide(jour("2026-11-19"), 0, new Date("2026-11-18T23:59:59Z"))).toBeNull();
    expect(messageGrilleVide(jour("2026-11-19"), 0, new Date("2026-11-19T00:00:00Z"))).toBe(MESSAGE_GRILLE_VIDE_AUJOURDHUI);
  });
});

describe("supprimer une grille : seulement à venir et inutilisée", () => {
  it("une grille à venir que rien n'utilise se supprime", () => {
    expect(messageSuppressionGrille("PROCHAINE", 0)).toBeNull();
    expect(resumerGrille("PROCHAINE", 0).supprimable).toBe(true);
  });
  it("une grille utilisée dit combien de propositions la retiennent", () => {
    expect(messageSuppressionGrille("PROCHAINE", 1)).toBe(messageGrilleUtilisee(1));
    expect(resumerGrille("PROCHAINE", 1).supprimable).toBe(false);
  });
  it("une grille en vigueur ou passée a servi de référence", () => {
    for (const statut of ["EN_VIGUEUR", "PASSEE"] as const) {
      expect(messageSuppressionGrille(statut, 0)).toBe(MESSAGE_SUPPRESSION_GRILLE);
      expect(resumerGrille(statut, 0).supprimable).toBe(false);
    }
  });
});

describe("les messages de doublon", () => {
  it("disent quoi faire", () => {
    expect(MESSAGE_DOUBLON_DATE).toBe("Une grille s'applique déjà à cette date. Choisissez un autre jour, ou modifiez cette grille.");
    expect(MESSAGE_DOUBLON_CODE).toBe("Cette grille a déjà un tarif avec ce code. Modifiez-le plutôt que d'en ajouter un second.");
  });
});

describe("messageRetraitTarif : une grille qui s'applique déjà ne se vide pas", () => {
  it("le dernier tarif d'une grille en vigueur (datée d'aujourd'hui ou avant) ne se retire pas", () => {
    expect(messageRetraitTarif(jour("2026-11-18"), 1, MAINTENANT)).toBe(MESSAGE_DERNIER_TARIF);
    expect(messageRetraitTarif(jour("2026-01-01"), 1, MAINTENANT)).toBe(MESSAGE_DERNIER_TARIF);
    expect(MESSAGE_DERNIER_TARIF).not.toMatch(/—/);
  });
  it("un tarif parmi d'autres se retire, et une grille à venir peut se vider", () => {
    expect(messageRetraitTarif(jour("2026-11-18"), 2, MAINTENANT)).toBeNull();
    expect(messageRetraitTarif(jour("2026-11-19"), 1, MAINTENANT)).toBeNull();
    expect(messageRetraitTarif(jour("2026-11-19"), 1, new Date("2026-11-19T00:00:00Z"))).toBe(MESSAGE_DERNIER_TARIF);
  });
});

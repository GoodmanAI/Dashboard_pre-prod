import { describe, expect, it } from "vitest";
import { CrmEtapeCommerciale, CrmTypeConcurrent } from "@prisma/client";
import { ETAPES_COMMERCIALES } from "@/pilot/lib/pipeline";
import {
  cleDeNom, ETAPES_AVANT_SIGNATURE, forcagePossible, LIBELLES_TYPE_CONCURRENT, marquerEnVigueur, MESSAGE_DOUBLON, MESSAGE_FORCAGE_IMPOSSIBLE,
  messageSuppressionRefusee, nettoyerNom, ordreReleves, trouverDoublon,
} from "./regles";

const TIRETS = /[\u2014\u2013]/;

describe("nom d'un concurrent", () => {
  it("retire les espaces de bord et ramène les espaces répétés à un seul", () => {
    expect(nettoyerNom("  Robot   Alpha\t Voix ")).toBe("Robot Alpha Voix");
  });
  it("compare sans la casse ni les espaces en trop", () => {
    expect(cleDeNom("Robot  ALPHA voix ")).toBe(cleDeNom("robot alpha voix"));
    expect(cleDeNom("ÉDITEUR Bêta")).toBe(cleDeNom("éditeur bêta"));
  });
  it("garde les accents et les mots : ce ne sont pas les mêmes noms", () => {
    expect(cleDeNom("Éditeur")).not.toBe(cleDeNom("Editeur"));
    expect(cleDeNom("Robot Alpha")).not.toBe(cleDeNom("RobotAlpha"));
  });
  it("trouve le doublon, casse et espaces confondus", () => {
    const existants = [{ id: 1, nom: "Robot Alpha Voix" }, { id: 2, nom: "Centre d'appels Beta" }];
    expect(trouverDoublon(existants, "  robot  alpha VOIX")?.id).toBe(1);
    expect(trouverDoublon(existants, "Centre d'appels Gamma")).toBeNull();
  });
  it("ne se compte pas lui-même quand on le renomme", () => {
    const existants = [{ id: 1, nom: "Robot Alpha Voix" }, { id: 2, nom: "Centre d'appels Beta" }];
    expect(trouverDoublon(existants, "ROBOT ALPHA VOIX", 1)).toBeNull();
    expect(trouverDoublon(existants, "robot alpha voix", 2)?.id).toBe(1);
  });
});

describe("nom d'un concurrent : espaces et caractères invisibles", () => {
  it.each([
    ["insécable", "\u00A0"], ["fine", "\u2009"], ["fine insécable", "\u202F"], ["cadratin", "\u2003"], ["idéographique", "\u3000"], ["tabulation", "\t"], ["saut de ligne", "\n"],
  ])("l'espace %s est retirée au bord et compactée à l'intérieur", (_nom, espace) => {
    expect(nettoyerNom(`${espace}Robot${espace}${espace}Alpha${espace}`)).toBe("Robot Alpha");
    expect(cleDeNom(`${espace}ROBOT${espace}alpha`)).toBe(cleDeNom("robot alpha"));
  });
  it("des espaces de natures différentes se ramènent à un seul espace ordinaire", () => {
    expect(nettoyerNom("Robot\u00A0\u2009\u3000 \tAlpha")).toBe("Robot Alpha");
  });
  it("É composé et É décomposé font le même nom", () => {
    const compose = "\u00C9diteur Beta", decompose = "E\u0301diteur Beta";
    expect(compose).not.toBe(decompose);
    expect(nettoyerNom(decompose)).toBe(nettoyerNom(compose));
    expect(cleDeNom(decompose)).toBe(cleDeNom(compose));
    expect(trouverDoublon([{ id: 1, nom: compose }], decompose)?.id).toBe(1);
  });
  it("l'accent compte toujours : Éditeur et Editeur restent deux noms, composé ou non", () => {
    expect(cleDeNom("E\u0301diteur")).not.toBe(cleDeNom("Editeur"));
  });
  it.each([["U+2019", "\u2019"], ["U+2018", "\u2018"], ["U+02BC", "\u02BC"]])("l'apostrophe %s vaut l'apostrophe droite pour comparer", (_nom, apostrophe) => {
    expect(cleDeNom(`Centre d${apostrophe}appels Beta`)).toBe(cleDeNom("Centre d'appels Beta"));
    expect(trouverDoublon([{ id: 1, nom: "Centre d'appels Beta" }], `centre d${apostrophe}APPELS beta`)?.id).toBe(1);
  });
  it("mais le nom enregistré garde l'apostrophe saisie", () => expect(nettoyerNom("Centre d\u2019appels")).toBe("Centre d\u2019appels"));
  it.each([["espace", "\u200B"], ["antiliaison", "\u200C"], ["liaison", "\u200D"], ["joint de mots", "\u2060"], ["marque d'ordre des octets", "\uFEFF"]])(
    "le caractère de largeur nulle (%s) est retiré", (_nom, nul) => {
      expect(nettoyerNom(`Ro${nul}bot Alpha`)).toBe("Robot Alpha");
      expect(nettoyerNom(`${nul}Robot Alpha${nul}`)).toBe("Robot Alpha");
      expect(cleDeNom(`Ro${nul}bot Alpha`)).toBe(cleDeNom("Robot Alpha"));
      expect(nettoyerNom(nul)).toBe("");
    });
  it("un nom fait seulement de caractères invisibles devient vide", () => {
    expect(nettoyerNom("\u200B\u200C\u200D\u2060\uFEFF")).toBe("");
    expect(nettoyerNom(" \u200B \u00A0\u3000 ")).toBe("");
    expect(cleDeNom("\u200B\u00A0")).toBe("");
  });
  it("un invisible entre deux espaces ne laisse pas un double espace", () => expect(nettoyerNom("Robot \u200B Alpha")).toBe("Robot Alpha"));
  it("un nom propre n'est pas modifié", () => expect(nettoyerNom("Robot Alpha Voix")).toBe("Robot Alpha Voix"));
  it("un nom caché derrière des invisibles est un doublon", () => {
    expect(trouverDoublon([{ id: 1, nom: "Robot Alpha" }], "Robot\u200B Alpha")?.id).toBe(1);
  });
});

describe("trouverDoublon : cas limites", () => {
  const existants = [{ id: 4, nom: "Robot Alpha" }, { id: 2, nom: "ROBOT  alpha" }, { id: 9, nom: "Centre Beta" }];
  it("une liste vide ne contient aucun doublon", () => {
    expect(trouverDoublon([], "Robot Alpha")).toBeNull();
    expect(trouverDoublon([], "Robot Alpha", 1)).toBeNull();
  });
  it("renvoie le premier de la liste quand plusieurs portent le même nom", () => {
    expect(trouverDoublon(existants, "robot alpha")?.id).toBe(4);
    expect(trouverDoublon([...existants].reverse(), "robot alpha")?.id).toBe(2);
  });
  it("le renommé est exclu : le premier homonyme exclu, le suivant est trouvé", () => {
    expect(trouverDoublon(existants, "robot alpha", 4)?.id).toBe(2);
    expect(trouverDoublon(existants, "robot alpha", 2)?.id).toBe(4);
  });
  it("le renommé seul ne se compte pas, mais un autre nom exclu ne change rien", () => {
    expect(trouverDoublon([{ id: 4, nom: "Robot Alpha" }], "Robot Alpha", 4)).toBeNull();
    expect(trouverDoublon(existants, "Centre Beta", 4)?.id).toBe(9);
  });
  it("un identifiant exclu qui n'existe pas n'exclut personne", () => expect(trouverDoublon(existants, "Centre Beta", 999)?.id).toBe(9));
  it("renvoie l'objet de la liste, avec tous ses champs", () => {
    const trouve = trouverDoublon([{ id: 1, nom: "Alpha", type: "AUTRE" }], "alpha");
    expect(trouve).toEqual({ id: 1, nom: "Alpha", type: "AUTRE" });
  });
});

describe("relevé en vigueur", () => {
  const r = (id: number, jour: string) => ({ id, releveLe: new Date(jour) });
  it("le plus récent par date est en vigueur, quel que soit l'ordre d'arrivée", () => {
    const marques = marquerEnVigueur([r(1, "2026-03-01"), r(2, "2026-09-01"), r(3, "2026-06-01")]);
    expect(marques.map((m) => m.id)).toEqual([2, 3, 1]);
    expect(marques.map((m) => m.enVigueur)).toEqual([true, false, false]);
  });
  it("à date égale, le dernier saisi l'emporte", () => {
    const marques = marquerEnVigueur([r(5, "2026-09-01"), r(7, "2026-09-01"), r(6, "2026-09-01")]);
    expect(marques.map((m) => m.id)).toEqual([7, 6, 5]);
    expect(marques.filter((m) => m.enVigueur).map((m) => m.id)).toEqual([7]);
  });
  it("un relevé antidaté ne prend pas la place du plus récent", () => {
    const marques = marquerEnVigueur([r(1, "2026-09-01"), r(2, "2026-01-01")]);
    expect(marques.find((m) => m.enVigueur)?.id).toBe(1);
  });
  it("aucun relevé, rien en vigueur ; l'entrée n'est pas modifiée", () => {
    expect(marquerEnVigueur([])).toEqual([]);
    const entree = [r(1, "2026-01-01"), r(2, "2026-02-01")];
    marquerEnVigueur(entree);
    expect(entree.map((e) => e.id)).toEqual([1, 2]);
  });
  it("un seul relevé est en vigueur, quel que soit leur nombre", () => {
    for (const n of [1, 2, 3, 10]) {
      const marques = marquerEnVigueur(Array.from({ length: n }, (_, i) => r(i + 1, `2026-0${(i % 9) + 1}-01`)));
      expect(marques.filter((m) => m.enVigueur)).toHaveLength(1);
      expect(marques[0].enVigueur).toBe(true);
    }
  });
  it("l'heure prime sur l'identifiant : le relevé du même jour le plus tardif l'emporte, même avec un identifiant plus petit", () => {
    const marques = marquerEnVigueur([r(9, "2026-09-01T09:00:00Z"), r(1, "2026-09-01T15:00:00Z")]);
    expect(marques.map((m) => m.id)).toEqual([1, 9]);
    expect(marques[0].enVigueur).toBe(true);
    expect(ordreReleves(r(9, "2026-09-01T09:00:00Z"), r(1, "2026-09-01T15:00:00Z"))).toBeGreaterThan(0);
  });
  it("à une milliseconde près, l'instant prime encore sur l'identifiant", () => {
    const marques = marquerEnVigueur([r(5, "2026-09-01T09:00:00.001Z"), r(6, "2026-09-01T09:00:00.000Z")]);
    expect(marques.map((m) => m.id)).toEqual([5, 6]);
  });
  it("égalité complète de l'instant : l'identifiant le plus grand d'abord", () => {
    expect(ordreReleves(r(3, "2026-09-01T09:00:00Z"), r(8, "2026-09-01T09:00:00Z"))).toBeGreaterThan(0);
    expect(ordreReleves(r(8, "2026-09-01T09:00:00Z"), r(3, "2026-09-01T09:00:00Z"))).toBeLessThan(0);
  });
  it("le même relevé comparé à lui-même est à égalité", () => expect(ordreReleves(r(3, "2026-09-01"), r(3, "2026-09-01"))).toBe(0));
  it("le résultat ne dépend pas de l'ordre d'arrivée", () => {
    const entree = [r(1, "2026-09-01T10:00:00Z"), r(2, "2026-09-01T10:00:00Z"), r(3, "2026-03-01"), r(4, "2026-09-01T18:00:00Z")];
    const attendu = marquerEnVigueur(entree).map((m) => m.id);
    expect(attendu).toEqual([4, 2, 1, 3]);
    expect(marquerEnVigueur([...entree].reverse()).map((m) => m.id)).toEqual(attendu);
  });
  it("ordreReleves ordonne du plus récent au plus ancien", () => {
    expect(ordreReleves(r(1, "2026-01-01"), r(2, "2026-02-01"))).toBeGreaterThan(0);
    expect(ordreReleves(r(2, "2026-01-01"), r(1, "2026-01-01"))).toBeLessThan(0);
  });
});

describe("forçage de la température", () => {
  it("les étapes avant signature sont celles du pipeline : une seule source", () => {
    expect(ETAPES_AVANT_SIGNATURE).toBe(ETAPES_COMMERCIALES);
    expect([...ETAPES_AVANT_SIGNATURE]).toEqual(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "EN_POC"]);
  });
  it.each(Object.values(CrmEtapeCommerciale))("%s : possible exactement si c'est une étape commerciale", (etape) => {
    expect(forcagePossible(etape)).toBe(ETAPES_COMMERCIALES.includes(etape));
  });
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"] as const)("possible en %s", (e) => expect(forcagePossible(e)).toBe(true));
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL"] as const)("impossible en %s", (e) => expect(forcagePossible(e)).toBe(false));
});

describe("suppression refusée", () => {
  it("dit combien d'organisations, au singulier et au pluriel, sans tiret cadratin", () => {
    expect(messageSuppressionRefusee(1)).toBe("Une organisation est liée à ce concurrent. Retirez ce lien avant de le supprimer.");
    expect(messageSuppressionRefusee(3)).toContain("3 organisations");
    expect(messageSuppressionRefusee(3)).not.toMatch(TIRETS);
  });
  it.each([2, 3, 10, 120])("%i organisations : le pluriel, jamais le singulier", (n) => {
    expect(messageSuppressionRefusee(n)).toBe(`${n} organisations sont liées à ce concurrent. Retirez ces liens avant de le supprimer.`);
  });
  it("une organisation : le singulier, sans chiffre", () => expect(messageSuppressionRefusee(1)).not.toMatch(/\d/));
});

describe("libellés et messages", () => {
  it("chaque type de concurrent a un libellé, et aucun libellé en trop", () => {
    expect(Object.keys(LIBELLES_TYPE_CONCURRENT).sort()).toEqual(Object.values(CrmTypeConcurrent).sort());
    for (const type of Object.values(CrmTypeConcurrent)) expect(LIBELLES_TYPE_CONCURRENT[type].trim().length, type).toBeGreaterThan(0);
  });
  it("les libellés sont distincts", () => {
    const libelles = Object.values(LIBELLES_TYPE_CONCURRENT);
    expect(new Set(libelles).size).toBe(libelles.length);
  });
  it("aucun message exporté ne contient de tiret cadratin ni demi-cadratin", () => {
    const messages = [...Object.values(LIBELLES_TYPE_CONCURRENT), MESSAGE_DOUBLON, MESSAGE_FORCAGE_IMPOSSIBLE,
      messageSuppressionRefusee(1), messageSuppressionRefusee(2), messageSuppressionRefusee(50)];
    for (const message of messages) expect(message).not.toMatch(TIRETS);
  });
});

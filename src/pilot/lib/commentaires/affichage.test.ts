import { describe, expect, it } from "vitest";
import {
  chiffrePastille, compteurSaisie, dateHeure, extrait, fusionnerPourVous, garderPagesChargees, lireComptePourVous, longueurSaisie, milliers, phraseAdresse, phraseFil, phrasePourVous,
  type Adresse,
} from "./affichage";
import { LONGUEUR_COMMENTAIRE, nouveauCommentaire } from "@/pilot/lib/validation/commentaire";

const LONGUEUR_MAXIMUM = LONGUEUR_COMMENTAIRE.max;

const adresse = (partiel: Partial<Adresse>): Adresse => ({ cible: "AUCUN", departement: null, personneId: null, cibleLibelle: "Personne", ...partiel });

describe("phraseAdresse", () => {
  it("dit à qui le commentaire a été adressé", () => {
    expect(phraseAdresse(adresse({ cible: "AUCUN" }), 1)).toBe("Sans alerte");
    expect(phraseAdresse(adresse({ cible: "TOUS", cibleLibelle: "Toute l'équipe" }), 1)).toBe("À tout le monde");
    expect(phraseAdresse(adresse({ cible: "DEPARTEMENT", departement: "PROJET", cibleLibelle: "Département Projet" }), 1)).toBe("Au département Projet");
    expect(phraseAdresse(adresse({ cible: "PERSONNE", personneId: 2, cibleLibelle: "Commercial A" }), 1)).toBe("À Commercial A");
  });
  it("dit « À vous » à la personne visée", () => {
    expect(phraseAdresse(adresse({ cible: "PERSONNE", personneId: 2, cibleLibelle: "Commercial A" }), 2)).toBe("À vous");
  });
  it("garde une phrase quand la personne ou le département n'existent plus", () => {
    expect(phraseAdresse(adresse({ cible: "PERSONNE", personneId: null, cibleLibelle: "Compte supprimé" }), 1)).toBe("À un compte supprimé");
    expect(phraseAdresse(adresse({ cible: "DEPARTEMENT", departement: null }), 1)).toBe("À un département");
  });
});

describe("phraseFil", () => {
  const tous = { ...adresse({ cible: "TOUS" }), nombreDestinataires: 4, auteurId: 1 };
  it("ajoute à l'auteur le nombre de personnes prévenues", () => {
    expect(phraseFil(tous, 1)).toBe("À tout le monde · 4 personnes prévenues");
    expect(phraseFil({ ...tous, nombreDestinataires: 1, cible: "PERSONNE", personneId: 2, cibleLibelle: "Projet A" }, 1)).toBe("À Projet A · 1 personne prévenue");
  });
  it("ne le dit pas aux autres lecteurs", () => {
    expect(phraseFil(tous, 2)).toBe("À tout le monde");
  });
  it("ne parle pas de prévenus quand il n'y a pas d'alerte", () => {
    expect(phraseFil({ ...adresse({ cible: "AUCUN" }), nombreDestinataires: 0, auteurId: 1 }, 1)).toBe("Sans alerte");
  });
  it("traite l'auteur disparu comme n'importe quel autre lecteur", () => {
    expect(phraseFil({ ...tous, auteurId: null }, 1)).toBe("À tout le monde");
  });
});

describe("compteur de saisie", () => {
  it("met en forme à la française", () => {
    expect(milliers(0)).toBe("0");
    expect(milliers(999)).toBe("999");
    expect(milliers(2000)).toBe("2 000");
  });
  it("compte les points de code et uniformise les retours à la ligne", () => {
    expect(longueurSaisie("abc")).toBe(3);
    expect(longueurSaisie("a\r\nb")).toBe(3);
    expect(longueurSaisie("😀😀")).toBe(2);
  });
  it("compte après le même nettoyage que le serveur : bouts rognés, invisibles retirés", () => {
    expect(longueurSaisie("   abc \n ")).toBe(3);
    expect(longueurSaisie("a​b­c﻿")).toBe(3);
    expect(longueurSaisie("ㅤ⠀")).toBe(0);
  });
  it("dit « dépassé » exactement quand le serveur refuse pour la longueur", () => {
    for (const texte of ["a".repeat(2000), ` ${"a".repeat(2000)} `, "a​".repeat(2000), "a".repeat(2001), `${"é".repeat(1999)}\u{1F600}\u{1F600}`]) {
      const depasse = compteurSaisie(texte).niveau === "depasse";
      expect(depasse, texte.slice(0, 10)).toBe(!nouveauCommentaire.safeParse({ texte }).success);
    }
  });
  it("passe de normal à proche puis dépassé", () => {
    expect(compteurSaisie("")).toEqual({ libelle: "0 / 2 000", niveau: "normal" });
    expect(compteurSaisie("a".repeat(1799)).niveau).toBe("normal");
    expect(compteurSaisie("a".repeat(1800)).niveau).toBe("proche");
    expect(compteurSaisie("a".repeat(LONGUEUR_MAXIMUM)).niveau).toBe("proche");
    expect(compteurSaisie("a".repeat(LONGUEUR_MAXIMUM + 1))).toEqual({ libelle: "2 001 / 2 000", niveau: "depasse" });
  });
});

describe("extrait", () => {
  it("rend un texte court tel quel, espaces et retours à la ligne ramenés à un seul", () => {
    expect(extrait("  Rappeler\n\nle  client  ")).toBe("Rappeler le client");
  });
  it("coupe à la fin d'un mot et ajoute des points de suspension", () => {
    const texte = "Le client attend le devis avant la fin du mois et demande une démonstration sur place avec les secrétaires";
    const court = extrait(texte, 50);
    expect(court).toBe("Le client attend le devis avant la fin du mois et…");
    expect(Array.from(court).length).toBeLessThanOrEqual(51);
    expect(extrait("Le client attend le devis avant la fin du mois et demande", 45)).toBe("Le client attend le devis avant la fin du…");
  });
  it("coupe net un mot sans espace, sans reste de ponctuation", () => {
    expect(extrait("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
    expect(extrait("Bonjour, tout le monde, et au revoir", 14)).toBe("Bonjour, tout…");
  });
  it("ne coupe jamais un emoji en deux", () => {
    expect(extrait("😀".repeat(20), 5)).toBe(`${"😀".repeat(5)}…`);
  });
  it("garde un texte de la longueur exacte", () => {
    expect(extrait("abcde", 5)).toBe("abcde");
  });
});

describe("fusionnerPourVous", () => {
  const JOUR = new Date("2026-11-19T00:00:00.000Z");
  const element = (id: number, creeLe: string) => ({ id, creeLe });
  const demande = (id: number, creeLe: string, echeanceLe: string | null = null) => ({ id, creeLe, echeanceLe, statut: "OUVERTE" as const });
  it("mêle demandes et commentaires du plus récent au plus ancien", () => {
    const liste = fusionnerPourVous(
      [demande(1, "2026-11-10T08:00:00.000Z"), demande(2, "2026-11-12T08:00:00.000Z", "2026-11-25T00:00:00.000Z")],
      [element(7, "2026-11-11T08:00:00.000Z"), element(8, "2026-11-13T08:00:00.000Z")],
      JOUR,
    );
    expect(liste.map((e) => e.cle)).toEqual(["c8", "d2", "c7", "d1"]);
  });
  it("met d'abord les demandes en retard, de la plus ancienne échéance à la plus récente", () => {
    const liste = fusionnerPourVous(
      [
        demande(1, "2026-11-18T08:00:00.000Z", "2026-11-17T00:00:00.000Z"),
        demande(2, "2026-11-01T08:00:00.000Z", "2026-11-10T00:00:00.000Z"),
        demande(3, "2026-11-18T09:00:00.000Z"),
        demande(4, "2026-11-02T08:00:00.000Z", "2026-11-19T00:00:00.000Z"),
        demande(5, "2026-11-05T08:00:00.000Z", "2026-11-10T00:00:00.000Z"),
      ],
      [element(9, "2026-11-18T10:00:00.000Z")],
      JOUR,
    );
    // 2 et 5 partagent l'échéance la plus ancienne (le plus petit identifiant d'abord), puis 1 ; 4 est pour aujourd'hui : pas en retard.
    expect(liste.map((e) => e.cle)).toEqual(["d2", "d5", "d1", "c9", "d3", "d4"]);
    expect(liste.filter((e) => e.enRetard).map((e) => e.cle)).toEqual(["d2", "d5", "d1"]);
  });
  it("une demande sans échéance ou déjà traitée n'est jamais en retard", () => {
    const traitee = { ...demande(1, "2026-11-01T08:00:00.000Z", "2026-11-02T00:00:00.000Z"), statut: "FAITE" as const };
    const liste = fusionnerPourVous([traitee, demande(2, "2026-11-02T08:00:00.000Z")], [], JOUR);
    expect(liste.map((e) => e.cle)).toEqual(["d2", "d1"]);
    expect(liste.some((e) => e.enRetard)).toBe(false);
  });
  it("à date égale, la demande passe avant le commentaire, puis l'identifiant le plus grand", () => {
    const meme = "2026-11-12T08:00:00.000Z";
    const liste = fusionnerPourVous([demande(1, meme), demande(5, meme)], [element(2, meme), element(9, meme)], JOUR);
    expect(liste.map((e) => e.cle)).toEqual(["d5", "d1", "c9", "c2"]);
  });
  it("ne dépend pas de l'ordre des entrées", () => {
    const d = [demande(1, "2026-11-10T08:00:00.000Z", "2026-11-12T00:00:00.000Z"), demande(2, "2026-11-12T08:00:00.000Z"), demande(3, "2026-11-11T08:00:00.000Z", "2026-11-11T00:00:00.000Z")];
    const c = [element(7, "2026-11-11T08:00:00.000Z"), element(8, "2026-11-01T08:00:00.000Z")];
    expect(fusionnerPourVous([...d].reverse(), [...c].reverse(), JOUR).map((e) => e.cle)).toEqual(fusionnerPourVous(d, c, JOUR).map((e) => e.cle));
  });
  it("rend une liste vide quand il n'y a rien", () => {
    expect(fusionnerPourVous([], [], JOUR)).toEqual([]);
  });
  it("garde l'élément d'origine pour l'écran", () => {
    const [premier] = fusionnerPourVous([], [element(3, "2026-11-12T08:00:00.000Z")], JOUR);
    expect(premier).toMatchObject({ genre: "commentaire", commentaire: { id: 3 } });
  });
});

describe("le fil garde ses pages après une relecture", () => {
  const ligne = (id: number, jour: number) => ({ id, creeLe: `2026-11-${String(jour).padStart(2, "0")}T08:00:00.000Z` });
  // Affiché : deux pages (jours 20 à 17, puis 16 à 13), le curseur pointe après le 13.
  const charge = { lignes: [ligne(20, 20), ligne(19, 19), ligne(18, 18), ligne(17, 17), ligne(16, 16), ligne(15, 15), ligne(14, 14), ligne(13, 13)], curseur: "c13" };
  it("remplace la première page et garde les plus anciennes, avec leur curseur", () => {
    const frais = { commentaires: [ligne(21, 21), ligne(20, 20), ligne(19, 19), ligne(18, 18)], suite: true, curseur: "c18" };
    const r = garderPagesChargees(charge, frais);
    expect(r.lignes.map((l) => l.id)).toEqual([21, 20, 19, 18, 17, 16, 15, 14, 13]);
    expect(r.curseur).toBe("c13");
  });
  it("ne double jamais une ligne", () => {
    const frais = { commentaires: [ligne(20, 20), ligne(19, 19), ligne(17, 17), ligne(16, 16)], suite: true, curseur: "c16" };
    const r = garderPagesChargees(charge, frais);
    expect(r.lignes.map((l) => l.id)).toEqual([20, 19, 17, 16, 15, 14, 13]);
  });
  it("prend la page fraîche seule quand rien de plus ancien n'était chargé", () => {
    const r = garderPagesChargees({ lignes: [ligne(21, 21), ligne(20, 20)], curseur: "c20" }, { commentaires: [ligne(22, 22), ligne(21, 21), ligne(20, 20)], suite: true, curseur: "c20" });
    expect(r).toEqual({ lignes: [ligne(22, 22), ligne(21, 21), ligne(20, 20)], curseur: "c20" });
  });
  it("sans suite côté serveur, la page fraîche est tout le fil", () => {
    const r = garderPagesChargees(charge, { commentaires: [ligne(20, 20)], suite: false, curseur: null });
    expect(r).toEqual({ lignes: [ligne(20, 20)], curseur: null });
  });
});

describe("compte « Pour vous » lu du serveur", () => {
  it("garde deux entiers positifs ou nuls", () => {
    expect(lireComptePourVous({ demandes: 2, commentaires: 0 })).toEqual({ demandes: 2, commentaires: 0 });
  });
  it("refuse toute autre forme", () => {
    for (const v of [null, "3", { demandes: 1 }, { demandes: -1, commentaires: 0 }, { demandes: 1.5, commentaires: 0 }, { erreur: "Connectez-vous pour continuer." }]) {
      expect(lireComptePourVous(v)).toBeNull();
    }
  });
});

describe("pastille", () => {
  it("n'affiche rien à zéro, le nombre jusqu'à 99, puis 99+", () => {
    expect(chiffrePastille(0)).toBeNull();
    expect(chiffrePastille(-1)).toBeNull();
    expect(chiffrePastille(1)).toBe("1");
    expect(chiffrePastille(99)).toBe("99");
    expect(chiffrePastille(100)).toBe("99+");
  });
  it("dit ce qu'elle compte, accordé", () => {
    expect(phrasePourVous(0, 0)).toBe("Rien de nouveau pour vous");
    expect(phrasePourVous(1, 0)).toBe("1 demande à traiter");
    expect(phrasePourVous(0, 3)).toBe("3 commentaires non lus");
    expect(phrasePourVous(2, 1)).toBe("2 demandes à traiter et 1 commentaire non lu");
  });
});

describe("dateHeure", () => {
  it("donne la date et l'heure de Paris, hiver comme été", () => {
    expect(dateHeure("2026-11-13T13:32:00.000Z")).toMatch(/13 nov\. 2026.*14:32/);
    expect(dateHeure("2026-07-13T12:32:00.000Z")).toMatch(/13 juil\. 2026.*14:32/);
  });
  it("ne casse pas sur une date illisible", () => {
    expect(dateHeure("pas une date")).toBe("");
  });
});

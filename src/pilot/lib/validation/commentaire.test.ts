import { describe, expect, it } from "vitest";
import { messageCommentaire, modificationDepartement, nouveauCommentaire, LONGUEUR_COMMENTAIRE } from "./commentaire";

const refus = (resultat: { success: boolean; error?: Parameters<typeof messageCommentaire>[0] }) => {
  if (resultat.success || !resultat.error) throw new Error("La saisie aurait dû être refusée.");
  return messageCommentaire(resultat.error);
};

describe("écrire un commentaire (lot T)", () => {
  it("par défaut, ne prévient personne", () => {
    expect(nouveauCommentaire.parse({ texte: "Rappelé ce matin." })).toEqual({ texte: "Rappelé ce matin.", cible: { cible: "AUCUN" } });
  });

  it("rogne le texte, espaces insécables et retours à la ligne compris", () => {
    expect(nouveauCommentaire.parse({ texte: "  \n  Bonjour   \t" }).texte).toBe("Bonjour");
    expect(nouveauCommentaire.parse({ texte: "Un\r\ndeux" }).texte).toBe("Un\ndeux");
  });

  it("refuse un texte vide ou fait d'espaces, insécables et signes invisibles compris", () => {
    for (const texte of ["", "   ", "  ", "\n\t", "​​", "﻿ "]) {
      expect(refus(nouveauCommentaire.safeParse({ texte }))).toBe("Écrivez votre commentaire.");
    }
    expect(refus(nouveauCommentaire.safeParse({}))).toBe("Écrivez votre commentaire.");
    expect(refus(nouveauCommentaire.safeParse({ texte: 12 }))).toBe("Écrivez votre commentaire.");
  });

  it("accepte 2 000 signes après nettoyage et refuse 2 001", () => {
    expect(LONGUEUR_COMMENTAIRE.max).toBe(2000);
    expect(nouveauCommentaire.safeParse({ texte: "a".repeat(2000) }).success).toBe(true);
    expect(nouveauCommentaire.safeParse({ texte: `  ${"a".repeat(2000)}  ` }).success).toBe(true);
    expect(refus(nouveauCommentaire.safeParse({ texte: "a".repeat(2001) }))).toBe("Le commentaire tient en 2 000 signes au plus.");
  });

  it("compte les signes comme la base (points de code), pas les unités UTF-16", () => {
    expect(nouveauCommentaire.safeParse({ texte: "\u{1F600}".repeat(2000) }).success).toBe(true);
    expect(nouveauCommentaire.safeParse({ texte: "\u{1F600}".repeat(2001) }).success).toBe(false);
  });

  it("borne la chaîne brute à 10 000 unités avant tout nettoyage", () => {
    expect(LONGUEUR_COMMENTAIRE.brut).toBe(10000);
    // 1 000 signes entourés d'espaces : le nettoyage les ramènerait sous 2 000, mais le brut dépasse déjà.
    expect(refus(nouveauCommentaire.safeParse({ texte: `${" ".repeat(9500)}${"a".repeat(1000)}` }))).toBe("Le commentaire tient en 2 000 signes au plus.");
    expect(nouveauCommentaire.safeParse({ texte: `${" ".repeat(7000)}${"a".repeat(1000)}` }).success).toBe(true);
    expect(refus(nouveauCommentaire.safeParse({ texte: "a".repeat(1_000_000) }))).toBe("Le commentaire tient en 2 000 signes au plus.");
  });
});

describe("le texte d'un commentaire reste du texte (lot T)", () => {
  const CARACTERE = "Le commentaire contient un caractère non pris en charge.";
  it("refuse les caractères de contrôle C0, sauf la tabulation et le retour à la ligne", () => {
    for (const c of ["\u0000", "\u0001", "\u0007", "\u0008", "\u000B", "\u000C", "\u001B", "\u001F", "\u007F"]) {
      expect(refus(nouveauCommentaire.safeParse({ texte: `Avant${c}après` }))).toBe(CARACTERE);
    }
    expect(nouveauCommentaire.parse({ texte: "Un\tdeux\ntrois" }).texte).toBe("Un\tdeux\ntrois");
    expect(nouveauCommentaire.parse({ texte: "Un\rdeux" }).texte).toBe("Un\ndeux");
  });
  it("refuse les caractères de contrôle C1", () => {
    for (const c of ["\u0080", "\u0090", "\u009B", "\u009F"]) {
      expect(refus(nouveauCommentaire.safeParse({ texte: `Avant${c}après` }))).toBe(CARACTERE);
    }
  });
  it("refuse un surrogate isolé, accepte une paire bien formée", () => {
    expect(refus(nouveauCommentaire.safeParse({ texte: "Texte \uD83D cassé" }))).toBe(CARACTERE);
    expect(refus(nouveauCommentaire.safeParse({ texte: "Texte \uDE00 cassé" }))).toBe(CARACTERE);
    expect(nouveauCommentaire.parse({ texte: "Bravo 😀" }).texte).toBe("Bravo \u{1F600}");
  });
  it("refuse les directionnels de surcharge et d'isolement", () => {
    for (const c of ["‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩"]) {
      expect(refus(nouveauCommentaire.safeParse({ texte: `facture${c}fdp.exe` }))).toBe(CARACTERE);
    }
    // Les marques de direction simples restent permises : un nom arabe ou hébreu en a besoin.
    expect(nouveauCommentaire.safeParse({ texte: "Nom ‏שלום" }).success).toBe(true);
  });
  it("retire les signes invisibles, au milieu comme aux bouts", () => {
    const invisibles = ["­", "͏", "ᅟ", "ᅠ", "᠎", "​", "‌", "‍", "⁠", "⁡", "⁢", "⁣", "⁤", "ㅤ", "⠀", "\u0085", "﻿", "ﾠ"];
    for (const c of invisibles) expect(nouveauCommentaire.parse({ texte: `${c}Bon${c}jour${c}` }).texte).toBe("Bonjour");
  });
  it("refuse en 400, jamais en 500, un texte fait d'espaces ou d'invisibles de toute sorte", () => {
    const vides = ["ㅤㅤ", "⠀", "ᅟᅠ", "­", "   　", "  ", "  \t\n", "ﾠ", "\u0085"];
    for (const texte of vides) expect(refus(nouveauCommentaire.safeParse({ texte }))).toBe("Écrivez votre commentaire.");
  });
  it("accepte un texte d'un seul signe visible : chiffre, ponctuation, symbole", () => {
    for (const texte of ["7", "?", "€", "\u{1F600}"]) expect(nouveauCommentaire.safeParse({ texte }).success).toBe(true);
  });
  it("compte la longueur après le nettoyage : les invisibles ne comptent pas", () => {
    expect(nouveauCommentaire.safeParse({ texte: "a​".repeat(2000) }).success).toBe(true);
  });
});

describe("pas de numéro de sécurité sociale (lot T)", () => {
  const NIR = "Ce texte ressemble à un numéro de sécurité sociale. Pilot ne garde aucune donnée patient.";
  it("refuse un NIR, avec ou sans espaces, avec ou sans clé", () => {
    for (const texte of [
      "Patient 1 85 05 78 006 084 36", "185057800608436", "NIR : 1850578006084", "2.69.05.2A.123.456.12", "Voir 269052B123456",
      "NIR 185057800608436", "Le 2 85 12 75 123 456, à rappeler",
    ]) expect(refus(nouveauCommentaire.safeParse({ texte }))).toBe(NIR);
  });
  it("laisse passer téléphone, SIREN, SIRET et montants", () => {
    for (const texte of [
      "Rappeler au 06 12 34 56 78", "Standard : 01.23.45.67.89", "+33 6 12 34 56 78", "SIREN 732 829 320", "SIRET 123 456 789 00012",
      "Montant 1 250 000,00 €", "Budget de 12 000 € par an", "Commande 2026-11-19", "Contrat 1234567",
    ]) expect(nouveauCommentaire.safeParse({ texte }).success, texte).toBe(true);
  });
});

describe("écrire un commentaire, cibles (lot T)", () => {
  it("une alerte à tout le monde", () => {
    expect(nouveauCommentaire.parse({ texte: "x", cible: "TOUS" }).cible).toEqual({ cible: "TOUS" });
  });

  it("une alerte à un département demande le département", () => {
    expect(nouveauCommentaire.parse({ texte: "x", cible: "DEPARTEMENT", departement: "PROJET" }).cible).toEqual({ cible: "DEPARTEMENT", departement: "PROJET" });
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "DEPARTEMENT" }))).toBe("Choisissez un département.");
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "DEPARTEMENT", departement: "COMPTA" }))).toBe("Choisissez un département.");
  });

  it("une alerte à une personne demande la personne", () => {
    expect(nouveauCommentaire.parse({ texte: "x", cible: "PERSONNE", personneId: 4 }).cible).toEqual({ cible: "PERSONNE", personneId: 4 });
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "PERSONNE" }))).toBe("Choisissez une personne.");
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "PERSONNE", personneId: 1.5 }))).toBe("Choisissez une personne.");
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "PERSONNE", personneId: -2 }))).toBe("Choisissez une personne.");
  });

  it("refuse un complément qui n'est pas celui de la cible", () => {
    expect(nouveauCommentaire.safeParse({ texte: "x", cible: "TOUS", departement: "PROJET" }).success).toBe(false);
    expect(nouveauCommentaire.safeParse({ texte: "x", cible: "AUCUN", personneId: 3 }).success).toBe(false);
    expect(nouveauCommentaire.safeParse({ texte: "x", cible: "DEPARTEMENT", departement: "PROJET", personneId: 3 }).success).toBe(false);
    expect(nouveauCommentaire.safeParse({ texte: "x", cible: "PERSONNE", personneId: 3, departement: "PROJET" }).success).toBe(false);
  });

  it("refuse une cible inconnue, un champ en plus et un corps qui n'en est pas un", () => {
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", cible: "TOUT_LE_MONDE" }))).toBe("Choisissez qui prévenir.");
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", organisationId: 3 }))).toBe("Vérifiez les champs du formulaire.");
    expect(refus(nouveauCommentaire.safeParse({ texte: "x", auteurId: 3 }))).toBe("Vérifiez les champs du formulaire.");
    expect(refus(nouveauCommentaire.safeParse(null))).toBe("Vérifiez les champs du formulaire.");
    expect(refus(nouveauCommentaire.safeParse("texte"))).toBe("Vérifiez les champs du formulaire.");
  });
});

describe("changer le département d'un compte (lot T)", () => {
  it("demande le département et la version lue", () => {
    expect(modificationDepartement.parse({ departement: "TECHNIQUE", majLe: null })).toEqual({ departement: "TECHNIQUE", majLe: null });
    expect(modificationDepartement.parse({ departement: "DIRECTION", majLe: "2026-12-14T08:00:00.000Z" }).majLe).toBe("2026-12-14T08:00:00.000Z");
  });
  it("refuse un département inconnu ou absent, et une version illisible", () => {
    expect(refus(modificationDepartement.safeParse({ departement: "COMPTA", majLe: null }))).toBe("Choisissez un département.");
    expect(refus(modificationDepartement.safeParse({ majLe: null }))).toBe("Choisissez un département.");
    expect(refus(modificationDepartement.safeParse({ departement: "PROJET", majLe: "hier" }))).toBe("Rechargez la page.");
    expect(refus(modificationDepartement.safeParse({ departement: "PROJET" }))).toBe("Rechargez la page.");
  });
  it("refuse un champ en plus", () => {
    expect(modificationDepartement.safeParse({ departement: "PROJET", majLe: null, role: "SUPER_ADMIN" }).success).toBe(false);
  });
});

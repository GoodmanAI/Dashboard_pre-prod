import { describe, expect, it } from "vitest";
import { changementMotDePasse, creationCompte, messageAcces, operationAcces } from "./acces";

const refus = (resultat: { success: boolean; error?: Parameters<typeof messageAcces>[0] }) => {
  if (resultat.success || !resultat.error) throw new Error("La saisie aurait dû être refusée.");
  return messageAcces(resultat.error);
};

describe("création d'un compte (C-64)", () => {
  const valide = { nom: "Développeur B", email: " Dev.B@Exemple.TEST ", profil: "DEVELOPPEUR", droits: ["EVALUER_PARC"] };
  it("met l'adresse en minuscules et sans espaces", () => {
    expect(creationCompte.parse(valide).email).toBe("dev.b@exemple.test");
  });
  it("le département est facultatif, et connu quand il est donné (lot T)", () => {
    expect(creationCompte.parse(valide).departement).toBeUndefined();
    expect(creationCompte.parse({ ...valide, departement: "TECHNIQUE" }).departement).toBe("TECHNIQUE");
    expect(refus(creationCompte.safeParse({ ...valide, departement: "COMPTA" }))).toBe("Choisissez un département.");
  });
  it("dit en français quel champ corriger", () => {
    expect(refus(creationCompte.safeParse({ ...valide, nom: "  " }))).toBe("Indiquez le nom de la personne.");
    expect(refus(creationCompte.safeParse({ ...valide, email: "pas-une-adresse" }))).toBe("Vérifiez l'adresse e-mail.");
    expect(refus(creationCompte.safeParse({ ...valide, profil: "SUPER_ADMIN" }))).toBe("Choisissez un rôle : développeur ou gérant.");
    expect(refus(creationCompte.safeParse({ ...valide, droits: ["TOUT"] }))).toBe("Droit inconnu.");
    expect(refus(creationCompte.safeParse({ nom: "Sans le reste" }))).toBe("Vérifiez l'adresse e-mail.");
    expect(refus(creationCompte.safeParse(null))).toBe("Vérifiez les champs du formulaire.");
  });
  it("refuse un champ en trop, comme un rôle Dashboard glissé dans le corps", () => {
    expect(refus(creationCompte.safeParse({ ...valide, role: "SUPER_ADMIN" }))).toBe("Vérifiez les champs du formulaire.");
  });
});

describe("actions sur un accès", () => {
  it("accepte les quatre actions", () => {
    for (const op of [{ operation: "droits", profil: "GERANT", droits: [], majLe: null }, { operation: "retirer" }, { operation: "rendre" }, { operation: "motDePasse" }]) {
      expect(operationAcces.safeParse(op).success).toBe(true);
    }
  });
  it("refuse une action inconnue et une version illisible", () => {
    expect(refus(operationAcces.safeParse({ operation: "supprimer" }))).toBe("Action inconnue.");
    expect(refus(operationAcces.safeParse({ operation: "droits", profil: "GERANT", droits: [], majLe: "hier" }))).toBe("Rechargez la page.");
  });
});

describe("changement de mot de passe", () => {
  it("demande au moins douze signes", () => {
    expect(refus(changementMotDePasse.safeParse({ actuel: "x", nouveau: "court" }))).toBe("Le nouveau mot de passe compte au moins 12 signes.");
    expect(changementMotDePasse.safeParse({ actuel: "x", nouveau: "Une phrase assez longue 2!" }).success).toBe(true);
  });
  it("applique aussi la politique du Dashboard : majuscule, minuscule, chiffre, signe", () => {
    expect(refus(changementMotDePasse.safeParse({ actuel: "x", nouveau: "une phrase assez longue" }))).toBe("Ajoutez au moins une majuscule.");
    expect(refus(changementMotDePasse.safeParse({ actuel: "x", nouveau: "Une phrase assez longue" }))).toBe("Ajoutez au moins un chiffre.");
    expect(refus(changementMotDePasse.safeParse({ actuel: "x", nouveau: "Une phrase assez longue 2" }))).toBe("Ajoutez au moins un de ces signes : @ $ ! % * ? &");
  });
});

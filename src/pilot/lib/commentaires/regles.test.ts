import { describe, expect, it } from "vitest";
import { peutSupprimerCommentaire } from "./regles";

describe("supprimer un commentaire (lot T)", () => {
  const auteur = { id: 1, role: "ADMIN" };
  it("l'auteur supprime", () => {
    expect(peutSupprimerCommentaire(1, auteur)).toBe(true);
  });
  it("un autre compte de l'équipe ne supprime pas, même gérant", () => {
    expect(peutSupprimerCommentaire(2, auteur)).toBe(false);
  });
  it("un super-administrateur supprime celui d'un autre", () => {
    expect(peutSupprimerCommentaire(2, { id: 9, role: "SUPER_ADMIN" })).toBe(true);
  });
  it("sans auteur (compte supprimé), seul un super-administrateur supprime", () => {
    expect(peutSupprimerCommentaire(null, auteur)).toBe(false);
    expect(peutSupprimerCommentaire(null, { id: 9, role: "SUPER_ADMIN" })).toBe(true);
  });
});

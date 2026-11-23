import { describe, expect, it } from "vitest";
import { libelleCible, resumeCommentaireEcrit } from "./libelles";

describe("libellés des commentaires (lot T)", () => {
  it("dit qui est prévenu, en clair", () => {
    expect(libelleCible("AUCUN", null, null)).toBe("Personne");
    expect(libelleCible("TOUS", null, null)).toBe("Toute l'équipe");
    expect(libelleCible("DEPARTEMENT", "PROJET", null)).toBe("Département Projet");
    expect(libelleCible("PERSONNE", null, "Commercial A")).toBe("Commercial A");
  });
  it("une personne dont le compte a disparu reste lisible", () => {
    expect(libelleCible("PERSONNE", null, null)).toBe("Compte supprimé");
  });
  it("le résumé du journal ne nomme jamais la personne, et n'a ni tiret cadratin ni texte libre", () => {
    expect(resumeCommentaireEcrit("PERSONNE", null)).toBe("Commentaire écrit, une personne prévenue");
    for (const r of [resumeCommentaireEcrit("AUCUN", null), resumeCommentaireEcrit("TOUS", null), resumeCommentaireEcrit("DEPARTEMENT", "TECHNIQUE")]) {
      expect(r).not.toMatch(/—/);
    }
    expect(resumeCommentaireEcrit("DEPARTEMENT", "TECHNIQUE")).toBe("Commentaire écrit, département Technique prévenu");
  });
});

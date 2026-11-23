import { describe, expect, it } from "vitest";
import { calculerDestinataires, type CompteEquipe } from "./destinataires";

const compte = (id: number, role: string, departement: CompteEquipe["departement"], accesRetire = false, nom = `Compte ${id}`): CompteEquipe =>
  ({ id, nom, role, departement, accesRetire });

const COMMERCIAL_A = compte(1, "ADMIN", "COMMERCIAL");
const COMMERCIAL_B = compte(2, "ADMIN", "COMMERCIAL");
const PROJET = compte(3, "ADMIN", "PROJET");
const TECHNIQUE = compte(4, "ADMIN", "TECHNIQUE");
const DIRECTION = compte(5, "SUPER_ADMIN", "DIRECTION");
const SANS_DEPARTEMENT = compte(6, "ADMIN", null);
const RETIRE = compte(7, "ADMIN", "PROJET", true, "Ancien collègue");
const CLIENT = compte(8, "CLIENT", null);
const EQUIPE = [COMMERCIAL_A, COMMERCIAL_B, PROJET, TECHNIQUE, DIRECTION, SANS_DEPARTEMENT, RETIRE, CLIENT];

const ok = (r: ReturnType<typeof calculerDestinataires>) => {
  if (!r.ok) throw new Error(`Refus inattendu : ${r.message}`);
  return r.destinataires;
};
const refus = (r: ReturnType<typeof calculerDestinataires>) => {
  if (r.ok) throw new Error("Un refus était attendu.");
  return r;
};

describe("destinataires d'un commentaire (lot T)", () => {
  describe("personne", () => {
    it("n'alerte personne, pour tout auteur", () => {
      expect(ok(calculerDestinataires({ cible: "AUCUN" }, 1, EQUIPE))).toEqual([]);
      expect(ok(calculerDestinataires({ cible: "AUCUN" }, 99, EQUIPE))).toEqual([]);
    });
  });

  describe("tout le monde", () => {
    it("rend l'équipe active, sans l'auteur, sans accès retiré, sans client", () => {
      expect(ok(calculerDestinataires({ cible: "TOUS" }, 1, EQUIPE))).toEqual([2, 3, 4, 5, 6]);
    });
    it("exclut l'auteur quel qu'il soit, super-administrateur compris", () => {
      expect(ok(calculerDestinataires({ cible: "TOUS" }, 5, EQUIPE))).toEqual([1, 2, 3, 4, 6]);
      expect(ok(calculerDestinataires({ cible: "TOUS" }, 6, EQUIPE))).not.toContain(6);
    });
    it("inclut les comptes sans département", () => {
      expect(ok(calculerDestinataires({ cible: "TOUS" }, 1, EQUIPE))).toContain(6);
    });
    it("est refusé quand l'auteur est seul dans l'équipe", () => {
      const r = refus(calculerDestinataires({ cible: "TOUS" }, 1, [COMMERCIAL_A, RETIRE, CLIENT]));
      expect(r.statut).toBe(400);
      expect(r.message).toBe("Personne d'autre que vous n'est dans l'équipe.");
    });
  });

  describe("un département", () => {
    it("rend les membres du département, sans l'auteur", () => {
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "COMMERCIAL" }, 3, EQUIPE))).toEqual([1, 2]);
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "COMMERCIAL" }, 1, EQUIPE))).toEqual([2]);
    });
    it("l'auteur d'un autre département n'est pas visé", () => {
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "TECHNIQUE" }, 3, EQUIPE))).toEqual([4]);
    });
    it("ne rend pas le compte dont l'accès est retiré, même dans le département", () => {
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "PROJET" }, 1, EQUIPE))).toEqual([3]);
    });
    it("le super-administrateur compte avec son département", () => {
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "DIRECTION" }, 1, EQUIPE))).toEqual([5]);
      expect(ok(calculerDestinataires({ cible: "DEPARTEMENT", departement: "DIRECTION" }, 5, [...EQUIPE, compte(9, "ADMIN", "DIRECTION")]))).toEqual([9]);
    });
    it("un super-administrateur sans département n'est dans aucun département", () => {
      const equipe = [COMMERCIAL_A, compte(10, "SUPER_ADMIN", null)];
      expect(refus(calculerDestinataires({ cible: "DEPARTEMENT", departement: "DIRECTION" }, 1, equipe)).statut).toBe(400);
    });
    it("un département où l'auteur est seul est refusé et le dit", () => {
      const r = refus(calculerDestinataires({ cible: "DEPARTEMENT", departement: "DIRECTION" }, 5, [DIRECTION, COMMERCIAL_A]));
      expect(r.statut).toBe(400);
      expect(r.message).toBe("Personne d'autre que vous n'est dans ce département.");
    });
    it("un département où il n'y a que des accès retirés est vide", () => {
      const equipe = [COMMERCIAL_A, compte(11, "ADMIN", "TECHNIQUE", true)];
      expect(refus(calculerDestinataires({ cible: "DEPARTEMENT", departement: "TECHNIQUE" }, 1, equipe)).statut).toBe(400);
    });
    it("un département sans aucun membre est refusé", () => {
      expect(refus(calculerDestinataires({ cible: "DEPARTEMENT", departement: "TECHNIQUE" }, 1, [COMMERCIAL_A])).statut).toBe(400);
    });
    it("un client rattaché par erreur à un département n'est jamais de l'équipe", () => {
      const equipe = [PROJET, compte(12, "CLIENT", "COMMERCIAL")];
      expect(refus(calculerDestinataires({ cible: "DEPARTEMENT", departement: "COMMERCIAL" }, 3, equipe)).statut).toBe(400);
    });
  });

  describe("une personne", () => {
    it("rend cette personne seule", () => {
      expect(ok(calculerDestinataires({ cible: "PERSONNE", personneId: 3 }, 1, EQUIPE))).toEqual([3]);
      expect(ok(calculerDestinataires({ cible: "PERSONNE", personneId: 5 }, 1, EQUIPE))).toEqual([5]);
    });
    it("accepte une personne sans département", () => {
      expect(ok(calculerDestinataires({ cible: "PERSONNE", personneId: 6 }, 1, EQUIPE))).toEqual([6]);
    });
    it("refuse de s'adresser à soi-même", () => {
      const r = refus(calculerDestinataires({ cible: "PERSONNE", personneId: 1 }, 1, EQUIPE));
      expect(r.statut).toBe(400);
      expect(r.message).toBe("Choisissez une autre personne. Pour vous-même, gardez le commentaire sans prévenir personne.");
    });
    it("refuse une personne inconnue", () => {
      const r = refus(calculerDestinataires({ cible: "PERSONNE", personneId: 404 }, 1, EQUIPE));
      expect(r.statut).toBe(400);
      expect(r.message).toBe("Choisissez une personne de l'équipe Lyrae.");
    });
    it("refuse un compte client", () => {
      expect(refus(calculerDestinataires({ cible: "PERSONNE", personneId: 8 }, 1, EQUIPE)).message).toBe("Choisissez une personne de l'équipe Lyrae.");
    });
    it("refuse un compte dont l'accès est retiré, et le nomme", () => {
      const r = refus(calculerDestinataires({ cible: "PERSONNE", personneId: 7 }, 1, EQUIPE));
      expect(r.statut).toBe(400);
      expect(r.message).toBe("Ancien collègue n'a plus accès à Pilot. Choisissez quelqu'un d'autre.");
    });
    it("l'auteur n'est jamais dans la liste", () => {
      for (const auteur of [1, 2, 3, 4, 5, 6]) {
        for (const personneId of [1, 2, 3, 4, 5, 6].filter((i) => i !== auteur)) {
          expect(ok(calculerDestinataires({ cible: "PERSONNE", personneId }, auteur, EQUIPE))).not.toContain(auteur);
        }
      }
    });
  });

  describe("forme du résultat", () => {
    it("rend des identifiants uniques et triés, quel que soit l'ordre de la liste", () => {
      const melangee = [DIRECTION, TECHNIQUE, COMMERCIAL_B, PROJET, COMMERCIAL_B, COMMERCIAL_A];
      expect(ok(calculerDestinataires({ cible: "TOUS" }, 99, melangee))).toEqual([1, 2, 3, 4, 5]);
    });
    it("ne modifie pas la liste reçue", () => {
      const copie = JSON.stringify(EQUIPE);
      calculerDestinataires({ cible: "TOUS" }, 1, EQUIPE);
      expect(JSON.stringify(EQUIPE)).toBe(copie);
    });
  });
});

import { expect, it } from "vitest";
import { grillePourActeur } from "./confidentialite";
const grille = { id: 1, tarifs: [{ code: "TALK", montantHtCentimes: 123 }, { code: "FORMATION_POC", montantHtCentimes: 456 }] };
it("le développeur conserve les anciens tarifs C-64 et ne reçoit pas le nouveau prix de formation", () => {
  expect(grillePourActeur(grille, { role: "ADMIN", droits: ["MODIFIER_MONTANTS"] }).tarifs).toEqual([grille.tarifs[0]]);
  expect(grille.tarifs).toHaveLength(2);
});
it("le lecteur CA voit le tarif de formation", () => {
  expect(grillePourActeur(grille, { role: "ADMIN", droits: ["VOIR_CA"] })).toEqual(grille);
});

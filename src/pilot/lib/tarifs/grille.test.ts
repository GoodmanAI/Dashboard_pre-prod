import { describe, expect, it } from "vitest";
import { GRILLE_VIDE, grilleDepuisTarifs, tarifDe, type TarifGrille } from "./grille";
import { estimerMontant } from "./estimer";
import { GRILLE_EN_BASE } from "@/pilot/lib/apports/grilleEssai";

const LE = { id: 4, applicableLe: new Date("2027-01-01T00:00:00Z") };
const tarif = (champs: Partial<TarifGrille> & Pick<TarifGrille, "code">): TarifGrille => ({
  libelle: champs.code, productId: null, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: null, pourMille: null, ...champs,
});

describe("grilleDepuisTarifs (lot S)", () => {
  it("porte l'identifiant, le jour d'application et tous les tarifs, dans l'ordre", () => {
    const tarifs = [tarif({ code: "DESK", productId: 3 }), tarif({ code: "TALK", productId: 1, montantHtCentimes: 27083 })];
    const g = grilleDepuisTarifs(LE, tarifs);
    expect(g).toMatchObject({ id: 4, applicableLe: "2027-01-01" });
    expect(g.tarifs).toEqual(tarifs);
    expect(tarifDe(g, "DESK")).toMatchObject({ productId: 3, montantHtCentimes: null });
    expect(tarifDe(g, "INCONNU")).toBeNull();
  });
  it("vue simple : Talk et Konnect par salle, le connecteur RIS en points de base (pour-mille × 10)", () => {
    expect(GRILLE_EN_BASE.prix).toEqual({
      TALK: { base: "PAR_SALLE", montantHtCentimes: 27083 }, KONNECT: { base: "PAR_SALLE", montantHtCentimes: 7917 },
    });
    expect(GRILLE_EN_BASE.connecteurRisPdm).toBe(1500);
  });
  it("un prix à renseigner ou d'une autre base n'entre pas dans la vue simple", () => {
    const g = grilleDepuisTarifs(LE, [
      tarif({ code: "TALK" }),
      tarif({ code: "KONNECT", base: "PAR_SITE", montantHtCentimes: 9000 }),
      tarif({ code: "CONNECTEUR_RIS", base: "PAR_SALLE", montantHtCentimes: 100 }),
    ]);
    expect(g.prix).toEqual({});
    expect(g.connecteurRisPdm).toBeNull();
  });
  it("sans grille en vigueur : une grille vide, aucun prix inventé", () => {
    expect(grilleDepuisTarifs(null, [])).toBe(GRILLE_VIDE);
    expect(GRILLE_VIDE).toEqual({ id: null, applicableLe: null, tarifs: [], prix: {}, connecteurRisPdm: null });
  });
});

describe("estimerMontant sur la grille commune (C-70, lot S)", () => {
  it("donne les mêmes montants qu'avec les réglages de l'apport : 4 salles Talk et connecteur", () => {
    // Avant le lot S : 27 083 HT la salle et 15 % depuis les réglages de l'apport. 4 × 27 083 = 108 332 ; 15 % = 16 249,8 → 16 250.
    expect(estimerMontant(4, { talk: true, konnect: false, connecteurRis: true }, GRILLE_EN_BASE)).toEqual({
      complet: true, mensuelCentimes: 124582, detail: { sallesCentimes: 108332, connecteurCentimes: 16250 },
    });
  });
  it("une grille vide : incomplet, et l'écran demande le montant à la main", () => {
    expect(estimerMontant(3, { talk: true, konnect: true, connecteurRis: true }, GRILLE_VIDE)).toEqual({
      complet: false, manquants: ["TALK", "KONNECT", "CONNECTEUR_RIS"],
    });
  });
});

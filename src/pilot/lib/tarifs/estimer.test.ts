import { describe, expect, it } from "vitest";
import { estimerMontant, premierProduitOffert, type OffresChoisies } from "./estimer";
import type { GrilleEnVigueur } from "./grille";

/** Une grille aux chiffres ronds : 270 € HT la salle pour Talk, 80 € pour Konnect, 15 % de connecteur. */
const grille: GrilleEnVigueur = {
  prix: { TALK: { base: "PAR_SALLE", montantHtCentimes: 27000 }, KONNECT: { base: "PAR_SALLE", montantHtCentimes: 8000 } },
  connecteurRisPdm: 1500,
  id: 1, applicableLe: "2026-11-18", tarifs: [],
};
const aucune: OffresChoisies = { talk: false, konnect: false, connecteurRis: false };
const talk: OffresChoisies = { ...aucune, talk: true };

describe("estimerMontant (C-70)", () => {
  it("ne propose rien sans salle ou avec un nombre de salles inconnu", () => {
    expect(estimerMontant(0, talk, grille)).toBeNull();
    expect(estimerMontant(null, talk, grille)).toBeNull();
    expect(estimerMontant(undefined, talk, grille)).toBeNull();
    expect(estimerMontant(Number.NaN, talk, grille)).toBeNull();
    expect(estimerMontant(-3, talk, grille)).toBeNull();
    expect(estimerMontant(2.5, talk, grille)).toBeNull();
  });
  it("ne propose rien sans offre cochée", () => {
    expect(estimerMontant(4, aucune, grille)).toBeNull();
  });
  it("une offre : le prix de la grille fois le nombre de salles", () => {
    expect(estimerMontant(4, talk, grille)).toMatchObject({ complet: true, mensuelCentimes: 108000 });
    expect(estimerMontant(3, { ...aucune, konnect: true }, grille)).toMatchObject({ complet: true, mensuelCentimes: 24000 });
  });
  it("plusieurs offres : les prix s'additionnent par salle", () => {
    expect(estimerMontant(5, { ...aucune, talk: true, konnect: true }, grille)).toMatchObject({ complet: true, mensuelCentimes: 175000 });
  });
  it("le connecteur RIS ajoute son pourcentage au montant des salles, comme le calcul des apports", () => {
    // 4 salles Talk : 108 000, plus 15 % = 16 200.
    expect(estimerMontant(4, { ...talk, connecteurRis: true }, grille)).toMatchObject({
      complet: true, mensuelCentimes: 124200, detail: { sallesCentimes: 108000, connecteurCentimes: 16200 },
    });
  });
  it("le connecteur RIS seul ne fait pas un montant : il suit les salles", () => {
    expect(estimerMontant(4, { ...aucune, connecteurRis: true }, grille)).toBeNull();
  });
  it("arrondit au centime une seule fois, sur le connecteur, la demi-unité allant vers le haut", () => {
    const g: GrilleEnVigueur = { ...grille, prix: { ...grille.prix, TALK: { base: "PAR_SALLE", montantHtCentimes: 27083 } } };
    // 10 × 270,83 € = 270 830 ; 15 % = 40 624,5 → 40 625 ; total 311 455.
    expect(estimerMontant(10, { ...talk, connecteurRis: true }, g)).toMatchObject({ mensuelCentimes: 311455, detail: { connecteurCentimes: 40625 } });
    // Un tiers de centime n'est pas arrondi avant le total.
    const h: GrilleEnVigueur = { ...grille, connecteurRisPdm: 333 };
    expect(estimerMontant(1, { ...talk, connecteurRis: true }, h)).toMatchObject({ mensuelCentimes: 27000 + 899 });
  });
  it("prix absent dans la grille : une indication incomplète, jamais un prix inventé", () => {
    const sansKonnect: GrilleEnVigueur = { ...grille, prix: { TALK: grille.prix.TALK } };
    expect(estimerMontant(2, { ...aucune, konnect: true }, sansKonnect)).toEqual({ complet: false, manquants: ["KONNECT"] });
    expect(estimerMontant(2, { ...aucune, talk: true, konnect: true }, sansKonnect)).toEqual({ complet: false, manquants: ["KONNECT"] });
  });
  it("connecteur RIS sans taux dans la grille : incomplet", () => {
    expect(estimerMontant(2, { ...talk, connecteurRis: true }, { ...grille, connecteurRisPdm: null })).toEqual({ complet: false, manquants: ["CONNECTEUR_RIS"] });
  });
  it("un prix à zéro dans la grille n'est pas un prix", () => {
    const g: GrilleEnVigueur = { ...grille, prix: { TALK: { base: "PAR_SALLE", montantHtCentimes: 0 } } };
    expect(estimerMontant(2, talk, g)).toEqual({ complet: false, manquants: ["TALK"] });
  });
  it("reste exact sur de grands nombres de salles", () => {
    expect(estimerMontant(2000, { ...talk, connecteurRis: true }, grille)).toMatchObject({ mensuelCentimes: 54_000_000 + 8_100_000 });
  });
  it("rattache le montant à la première offre de salle cochée, Talk avant Konnect", () => {
    expect(premierProduitOffert(["KONNECT", "TALK"])).toBe("TALK");
    expect(premierProduitOffert(["CONNECTEUR_RIS", "KONNECT"])).toBe("KONNECT");
    expect(premierProduitOffert(["CONNECTEUR_RIS"])).toBeNull();
    expect(premierProduitOffert([])).toBeNull();
  });
});

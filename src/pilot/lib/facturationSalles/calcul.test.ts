import { describe, expect, it } from "vitest";
import { facturerLignes, facturationCsv, prixDesSalles, ttc } from "./calcul";

const ligne = (talk: number, konnect: number) => ({ userId: 1, nom: "Centre A", codeSite: "MEN", talk, konnect, aRegler: [] });

describe("facturation à la salle (grille de Pilot)", () => {
  it("lit le prix HT par salle sur la grille", () => {
    expect(prixDesSalles({ prix: { TALK: { base: "PAR_SALLE", montantHtCentimes: 27083 } } })).toEqual({ talk: 27083, konnect: null });
  });
  it("multiplie les salles par le prix, en centimes entiers", () => {
    const f = facturerLignes([ligne(2, 1)], { talk: 27083, konnect: 7917 });
    expect(f.lignes[0].totalHtCentimes).toBe(2 * 27083 + 7917);
    expect(f.totalHtCentimes).toBe(62083);
    expect(f.incomplet).toBe(false);
  });
  it("n'invente jamais un prix : total de ligne vide et total partiel signalé", () => {
    const f = facturerLignes([ligne(1, 1), ligne(1, 0)], { talk: 27083, konnect: null });
    expect(f.lignes[0].totalHtCentimes).toBeNull();
    expect(f.lignes[0].htCentimes.konnect).toBeNull();
    expect(f.lignes[1].totalHtCentimes).toBe(27083);
    expect(f.totalHtCentimes).toBe(27083);
    expect(f.incomplet).toBe(true);
  });
  it("un produit sans salle ne demande pas de prix", () => {
    expect(facturerLignes([ligne(0, 3)], { talk: null, konnect: 7917 }).lignes[0].totalHtCentimes).toBe(3 * 7917);
  });
  it("retrouve le TTC de l'ancien écran (325 € et 95 €)", () => {
    expect(ttc(27083)).toBe(32500);
    expect(ttc(7917)).toBe(9500);
  });
  it("écrit un CSV lisible par Excel", () => {
    const csv = facturationCsv(facturerLignes([{ ...ligne(1, 0), nom: "Centre; B" }], { talk: 27083, konnect: 7917 }));
    expect(csv.startsWith("﻿Client;Site")).toBe(true);
    expect(csv).toContain('"Centre; B";MEN;1;270,83;0;0,00;270,83;325,00;');
  });
});

describe("tarif du contrat (premiers clients, 25/11/2026)", () => {
  const l = (userId: number, talk: number, konnect: number, codeSite: string | null = null) =>
    ({ userId, nom: `Client ${userId}`, codeSite, talk, konnect, aRegler: [] as ("talk" | "konnect")[] });
  it("un client sous contrat paie son contrat, une fois, quel que soit le nombre de salles ou de sites", () => {
    const contrats = new Map([[1, { talk: 50000 }]]);
    const f = facturerLignes([l(1, 3, 0, "A"), l(1, 2, 0, "B"), l(2, 1, 0)], { talk: 27083, konnect: 7917 }, contrats);
    expect(f.lignes[0].htCentimes.talk).toBe(50000);
    expect(f.lignes[0].sources.talk).toBe("contrat");
    expect(f.lignes[1].htCentimes.talk).toBe(0);
    expect(f.lignes[2].htCentimes.talk).toBe(27083);
    expect(f.lignes[2].sources.talk).toBe("grille");
    expect(f.totalHtCentimes).toBe(50000 + 27083);
  });
  it("le contrat d'un produit laisse l'autre produit à la grille, et un prix de grille absent ne gêne pas un client sous contrat", () => {
    const f = facturerLignes([l(1, 2, 1)], { talk: null, konnect: 7917 }, new Map([[1, { talk: 0 }]]));
    expect(f.lignes[0].htCentimes).toEqual({ talk: 0, konnect: 7917 });
    expect(f.incomplet).toBe(false);
  });
});

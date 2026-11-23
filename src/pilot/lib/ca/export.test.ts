import { describe, expect, it } from "vitest";
import { AVERTISSEMENT_EXPORT, construireCsv, EN_TETE_EXPORT, eurosCsv, MODELE_TARIFAIRE_VALIDE, nomFichierExport, periodeExport, PRODUIT_HORS_CATALOGUE, texteCsv } from "./export";

const date = (s: string) => new Date(s);

describe("montants comptables depuis les centimes", () => {
  it.each([[123456, "1234,56"], [0, "0,00"], [5, "0,05"], [99, "0,99"], [100, "1,00"], [-5, "-0,05"], [-123456, "-1234,56"], [2147483647, "21474836,47"]])
  ("%i centimes", (centimes, attendu) => expect(eurosCsv(centimes)).toBe(attendu));
  it("refuse un montant qui n'est pas un entier sûr", () => {
    for (const valeur of [1.5, Number.NaN, 2 ** 53]) expect(() => eurosCsv(valeur)).toThrow();
  });
});

describe("champs texte protégés", () => {
  it("met entre guillemets et double les guillemets", () => {
    expect(texteCsv("Centre d'imagerie Beta")).toBe(`"Centre d'imagerie Beta"`);
    expect(texteCsv('Le "grand" site; nord')).toBe(`"Le ""grand"" site; nord"`);
    expect(texteCsv(null)).toBe(`""`);
    expect(texteCsv("ligne\r\nsuivante")).toBe(`"ligne\r\nsuivante"`);
  });
  it.each(["=SOMME(A1:A2)", "+33 1", "-2", "@cmd", "\tcache", "\rretour"])("neutralise la formule %j", (valeur) => {
    expect(texteCsv(valeur)).toBe(`"'${valeur}"`);
  });
  it("laisse une valeur ordinaire telle quelle, même avec un signe au milieu", () => {
    expect(texteCsv("Alpha - site =2")).toBe(`"Alpha - site =2"`);
  });
});

describe("paramètres de l'export", () => {
  it("lit deux mois AAAA-MM, bornes comprises", () => {
    expect(periodeExport({ de: "2026-07", a: "2026-09" })).toEqual({ de: date("2026-07-01"), a: date("2026-09-01"), finExclue: date("2026-10-01"), nbMois: 3 });
    expect(periodeExport({ de: "2026-09", a: "2026-09" }).nbMois).toBe(1);
    expect(periodeExport({ de: "2024-01", a: "2026-12" }).nbMois).toBe(36);
  });
  it.each([
    [{ de: "2026-7", a: "2026-09" }], [{ de: "2026-13", a: "2026-12" }], [{ de: "2026-00", a: "2026-12" }],
    [{ de: null, a: "2026-09" }], [{ de: "2026-07", a: undefined }], [{ de: "2026-07-01", a: "2026-09" }], [{ de: ["2026-07"], a: "2026-09" }],
  ])("refuse le format %j", (p) => expect(() => periodeExport(p)).toThrowError(expect.objectContaining({ statut: 400 })));
  it("refuse un début après la fin et plus de 36 mois", () => {
    expect(() => periodeExport({ de: "2026-10", a: "2026-09" })).toThrowError(expect.objectContaining({ statut: 400, message: "Période invalide : le premier mois suit le dernier." }));
    expect(() => periodeExport({ de: "2023-12", a: "2026-12" })).toThrowError(expect.objectContaining({ statut: 400, message: "Période trop longue : 36 mois au plus." }));
  });
  it("nomme le fichier par sa période", () => {
    expect(nomFichierExport(date("2026-07-01"), date("2026-09-01"))).toBe("pilot-ca-2026-07-2026-09.csv");
  });
});

describe("fichier CSV comptable", () => {
  const ligne = { mois: date("2026-09-01"), organisation: "=Alpha", produit: "LyraeTalk", centre: null, recurrentCentimes: 90000,
    variableCentimes: 1050, miseEnServiceCentimes: 0, volumeVariable: 230, uniteVariable: "APPEL_TRAITE" as const };
  it("BOM, avertissement d'abord tant que Q1 est ouverte, en-tête, virgule décimale et CRLF", () => {
    expect(MODELE_TARIFAIRE_VALIDE).toBe(false);
    const csv = construireCsv([ligne, { ...ligne, centre: "Site principal", variableCentimes: 0, volumeVariable: null, uniteVariable: null }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      `"${AVERTISSEMENT_EXPORT}"`,
      EN_TETE_EXPORT.join(";"),
      `"2026-09";"'=Alpha";"LyraeTalk";"";900,00;10,50;0,00;910,50;230;"appel traité"`,
      `"2026-09";"'=Alpha";"LyraeTalk";"Site principal";900,00;0,00;0,00;900,00;;""`,
      "",
    ]);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(EN_TETE_EXPORT.join(";")).toBe("mois;organisation;produit;centre;recurrent;variable;mise_en_service;total;volume;unite");
  });
  it("une ligne sans produit (lot S) s'écrit « Hors catalogue », ses prestations dans la colonne mise en service", () => {
    const csv = construireCsv([{ ...ligne, produit: null, recurrentCentimes: 0, variableCentimes: 0, miseEnServiceCentimes: 150000, volumeVariable: null, uniteVariable: null }], true);
    expect(csv.slice(1).split("\r\n")[1]).toBe(`"2026-09";"'=Alpha";"${PRODUIT_HORS_CATALOGUE}";"";0,00;0,00;1500,00;1500,00;;""`);
    expect(PRODUIT_HORS_CATALOGUE).toBe("Hors catalogue");
  });
  it("sans avertissement une fois le modèle validé, et en-tête seul sans ligne", () => {
    expect(construireCsv([], true)).toBe("﻿" + EN_TETE_EXPORT.join(";") + "\r\n");
  });
});

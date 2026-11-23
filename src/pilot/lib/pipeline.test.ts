import { describe, expect, it } from "vitest";
import type { CrmEtapeCommerciale } from "@prisma/client";
import { cheminVersSigne, estClient, etapeAvantSortie, PROBABILITE_PAR_ETAPE, probabiliteEffective, transitionPermise, vieillissement } from "./pipeline";

const etapes: CrmEtapeCommerciale[] = [
  "PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "SIGNE",
  "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL",
];

// Oracle écrit en dur : chaque colonne suit etapes, sans reproduire l'algorithme.
const attendus = [
  [true,  true,  false, false, false, false, false, false, true, true],
  [true,  true,  true,  false, false, false, false, false, true, true],
  [false, true,  true,  true,  false, false, false, false, true, true],
  [false, false, true,  true,  true,  false, false, false, true, true],
  [false, false, false, true,  true,  true,  false, false, true, true],
  [false, false, false, false, true,  true,  true,  false, true, true],
  [false, false, false, false, false, true,  true,  true,  true, true],
  [true,  false, false, false, false, false, true,  true,  true, true],
  [true,  false, false, false, false, false, false, false, true, true],
  [true,  false, false, false, false, false, false, false, true, true],
];

describe("transitionPermise : les 100 paires", () => {
  for (const [i, depuis] of etapes.entries()) {
    for (const [j, vers] of etapes.entries()) {
      it(`${depuis} vers ${vers} : ${attendus[i][j]}`, () => {
        expect(transitionPermise(depuis, vers)).toBe(attendus[i][j]);
      });
    }
  }
});

it.each([
  ["PROSPECT", false], ["POURPARLERS", false], ["VISIO_TECHNIQUE", false],
  ["PROPOSITION", false], ["SIGNE", true], ["EN_INTEGRATION", true],
  ["EN_PRODUCTION", true], ["ARRETE", false], ["PERDU", false], ["EN_SOMMEIL", false],
] as const)("estClient(%s) : %s", (etape, attendu) => {
  expect(estClient(etape)).toBe(attendu);
});

describe("cheminVersSigne : la conversion franchit chaque étape, une à une", () => {
  it.each([
    ["PROSPECT", ["POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "SIGNE"]],
    ["POURPARLERS", ["VISIO_TECHNIQUE", "PROPOSITION", "SIGNE"]],
    ["VISIO_TECHNIQUE", ["PROPOSITION", "SIGNE"]],
    ["PROPOSITION", ["SIGNE"]],
  ] as const)("depuis %s : %j", (depuis, attendu) => {
    expect(cheminVersSigne(depuis)).toEqual(attendu);
  });
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL"] as const)("refusée depuis %s", (depuis) => {
    expect(cheminVersSigne(depuis)).toBeNull();
  });
  it.each(etapes)("depuis %s, chaque pas consécutif satisfait transitionPermise et finit en Signé", (depuis) => {
    const chemin = cheminVersSigne(depuis);
    if (!chemin) return;
    expect(chemin.at(-1)).toBe("SIGNE");
    let courante = depuis;
    for (const vers of chemin) {
      expect(vers).not.toBe(courante);
      expect(transitionPermise(courante, vers)).toBe(true);
      courante = vers;
    }
  });
});

describe("vieillissement après une conversion", () => {
  const maintenant = new Date("2026-11-18T10:00:00Z");
  it("une étape franchie à l'instant compte zéro jour, sans dépassement", () => {
    expect(vieillissement("SIGNE", maintenant, maintenant)).toEqual({ jours: 0, seuil: 14, depasse: false });
  });
  it("une date posée quelques millisecondes après la lecture compte aussi zéro jour", () => {
    expect(vieillissement("SIGNE", new Date(maintenant.getTime() + 5), maintenant)).toEqual({ jours: 0, seuil: 14, depasse: false });
  });
});

describe("probabiliteEffective", () => {
  it("sans correction, l'étape décide", () => {
    expect(probabiliteEffective({ probabilite: 80, probabiliteForcee: false }, "PROSPECT")).toBe(PROBABILITE_PAR_ETAPE.PROSPECT);
    expect(probabiliteEffective({ probabilite: 80, probabiliteForcee: false }, "PROPOSITION")).toBe(65);
  });
  it("corrigée à la main, la probabilité de l'opportunité l'emporte, zéro compris", () => {
    expect(probabiliteEffective({ probabilite: 80, probabiliteForcee: true }, "PROSPECT")).toBe(80);
    expect(probabiliteEffective({ probabilite: 0, probabiliteForcee: true }, "SIGNE")).toBe(0);
  });
});

describe("reprise après une sortie (C-86)", () => {
  it("un dossier sorti revient d'un geste à l'étape d'où il est sorti, pas ailleurs", () => {
    expect(transitionPermise("EN_SOMMEIL", "EN_PRODUCTION", "EN_PRODUCTION")).toBe(true);
    expect(transitionPermise("PERDU", "SIGNE", "SIGNE")).toBe(true);
    expect(transitionPermise("EN_SOMMEIL", "SIGNE", "EN_PRODUCTION")).toBe(false);
    expect(transitionPermise("EN_SOMMEIL", "EN_PRODUCTION")).toBe(false);
    expect(transitionPermise("EN_SOMMEIL", "PROSPECT", "EN_PRODUCTION")).toBe(true);
  });
  it("hors sortie, l'étape d'avant ne change rien", () => {
    expect(transitionPermise("PROSPECT", "SIGNE", "SIGNE")).toBe(false);
  });
  const chg = (avant: string, apres: string) => ({ avant: { etape: avant }, apres: { etape: apres } });
  it("lit le journal du plus récent au plus ancien et remonte les passages entre sorties", () => {
    expect(etapeAvantSortie("PERDU", [chg("EN_SOMMEIL", "PERDU"), chg("EN_PRODUCTION", "EN_SOMMEIL"), chg("EN_INTEGRATION", "EN_PRODUCTION")])).toBe("EN_PRODUCTION");
    expect(etapeAvantSortie("EN_SOMMEIL", [chg("SIGNE", "EN_SOMMEIL")])).toBe("SIGNE");
  });
  it("null hors sortie, ou quand le journal ne dit rien", () => {
    expect(etapeAvantSortie("SIGNE", [chg("PROPOSITION", "SIGNE")])).toBeNull();
    expect(etapeAvantSortie("PERDU", [])).toBeNull();
  });
});

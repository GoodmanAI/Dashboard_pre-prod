import { describe, expect, it } from "vitest";
import { joursDuMoisCourant, projeterFinDeMois, resumerMoisCourant } from "./moisCourant";
import { reelDuMois, type LigneReel } from "./reel";

const date = (s: string) => new Date(s);
const ligne = (champs: Partial<LigneReel>): LigneReel => ({ cle: "", mois: date("2026-10-01"), organisationId: 1, productId: 1, centreId: null,
  recurrentCentimes: 0, variableCentimes: 0, miseEnServiceCentimes: 0, volumeVariable: null, uniteVariable: null, ...champs });

describe("mois courant au jour près", () => {
  it("compte le jour en cours, en jours UTC, avec la longueur réelle du mois", () => {
    expect(joursDuMoisCourant(date("2026-10-12T08:00:00Z"))).toEqual({ jour: 12, joursDuMois: 31 });
    expect(joursDuMoisCourant(date("2026-10-01T00:00:00Z"))).toEqual({ jour: 1, joursDuMois: 31 });
    expect(joursDuMoisCourant(date("2028-02-29T23:59:59Z"))).toEqual({ jour: 29, joursDuMois: 29 });
    expect(joursDuMoisCourant(date("2026-11-30T23:00:00Z"))).toEqual({ jour: 30, joursDuMois: 30 });
  });
  it("projette la variable à fin de mois pondérée par les jours, en entier", () => {
    expect(projeterFinDeMois(1200, 12, 31)).toBe(3100);
    expect(projeterFinDeMois(100, 3, 31)).toBe(1033);
    // 1 × 31 / 2 = 15,5 : demi vers le haut.
    expect(projeterFinDeMois(1, 2, 31)).toBe(16);
    expect(projeterFinDeMois(0, 12, 31)).toBe(0);
  });
  it("le premier jour vaut une journée entière, le dernier ne change rien", () => {
    expect(projeterFinDeMois(10, 1, 31)).toBe(310);
    expect(projeterFinDeMois(10, 0, 31)).toBe(310);
    expect(projeterFinDeMois(777, 31, 31)).toBe(777);
  });
  it("résume le mois et garde les motifs", () => {
    const resume = resumerMoisCourant({ maintenant: date("2026-10-02T10:00:00Z"), motifs: ["Compteur de SMS non disponible"],
      lignes: [ligne({ recurrentCentimes: 90000, miseEnServiceCentimes: 5, variableCentimes: 1 }), ligne({ variableCentimes: 1 })],
      lignesProjetees: [ligne({ recurrentCentimes: 90000, variableCentimes: 16 }), ligne({ variableCentimes: 16 })] });
    expect(resume).toEqual({ mois: "2026-10-01T00:00:00.000Z", recurrent: 90000, miseEnService: 5, variableAuJour: 2, variableProjetee: 32,
      jour: 2, joursDuMois: 31, motifs: ["Compteur de SMS non disponible"] });
  });
  it("projette le volume avant de retirer le volume inclus (§8.9)", () => {
    // 120 appels au 12 octobre, 200 inclus, 35 centimes l'appel au-delà : rien à ce jour,
    // mais 310 appels attendus à fin de mois, soit 110 facturés.
    const entrees = { mois: date("2026-10-01"), rattachements: [{ organisationId: 1, productId: 1, centreId: 1, userProductId: 9 }],
      usage: new Map([[9, { APPEL_TRAITE: 120, RDV_PRIS: 0, SMS_ENVOYE: null }]]),
      contrats: [{ organisationId: 1, statut: "ACTIF" as const, debuteLe: date("2026-01-01"), signeLe: null, termineLe: null,
        lignes: [{ id: 1, productId: 1, centreId: null, type: "PART_VARIABLE" as const, montantCentimes: 35, unite: "APPEL_TRAITE" as const, volumeInclus: 200 }] }] };
    expect(reelDuMois(entrees).lignes[0].variableCentimes).toBe(0);
    expect(reelDuMois({ ...entrees, volumeProjete: (v) => projeterFinDeMois(v, 12, 31) }).lignes[0].variableCentimes).toBe(110 * 35);
  });
});

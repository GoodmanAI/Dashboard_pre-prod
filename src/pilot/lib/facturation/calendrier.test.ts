import { describe, expect, it } from "vitest";
import { calendrierFacturation, premierPoc, prixFormation, regularisationFormation } from "./calendrier";
import { projeter } from "@/pilot/lib/ca/projeter";
import { reelDuMois } from "@/pilot/lib/ca/reel";

const d = (s: string) => new Date(s + "T00:00:00Z");
const cycle = { id: "a", debuteLe: d("2026-11-03"), prolongeLe: null };
const formation = { cycleId: "a", debuteLe: cycle.debuteLe, montantCentimes: 12345, grilleId: 4, factureEmiseLe: null, comptabiliseeLe: null };
const contrat = { statut: "ACTIF" as const, debuteLe: d("2026-12-03"), signeLe: null, termineLe: null,
  lignes: [{ id: 1, type: "ABONNEMENT" as const, montantCentimes: 9876 }, { id: 2, type: "MISE_EN_SERVICE" as const, montantCentimes: 1000 }] };
const calendrier = (p: Partial<Parameters<typeof calendrierFacturation>[0]> = {}) => calendrierFacturation({ cycles: [cycle], formation, contrats: [], moisDepart: d("2026-11-01"), nbMois: 4, maintenant: d("2026-11-22"), ...p });

describe("Calendrier de facturation C-95", () => {
  it("formation au mois du début et POC gratuit sur deux mois civils", () => {
    const c = calendrier();
    expect(c[0].montantCentimes).toBe(12345);
    expect(c[0].lignes.map((l) => l.type)).toEqual(["FORMATION", "GRATUIT"]);
    expect(c[1].lignes.map((l) => l.type)).toEqual(["GRATUIT"]);
    expect(c[1].montantCentimes).toBe(0);
    expect(c[0].mois).toEqual(d("2026-11-01"));
  });
  it("prolongation gratuite, périodes exactes, sans deuxième formation", () => {
    const c = calendrier({ cycles: [{ ...cycle, prolongeLe: d("2026-11-25") }] });
    expect(c[1].lignes.map((l) => l.type)).toEqual(["GRATUIT", "PROLONGATION"]);
    expect(c[1].lignes[1].debuteLe).toEqual(d("2026-12-03"));
    expect(c[2].lignes[0].termineLe).toEqual(d("2027-01-02"));
    expect(c.reduce((s, m) => s + m.montantCentimes, 0)).toBe(12345);
  });
  it("un POC non transformé conserve sa formation, sans contrat", () => {
    expect(calendrier({ cycles: [{ ...cycle, issue: "NON_TRANSFORME" }] })[0].montantCentimes).toBe(12345);
  });
  it("POC validé puis contrat, mois entier et installation additionnée", () => {
    const c = calendrier({ contrats: [contrat] });
    expect(c[1].lignes.map((l) => l.type)).toEqual(["GRATUIT", "PAYANT"]);
    expect(c.map((m) => m.montantCentimes)).toEqual([12345, 10876, 9876, 9876]);
  });
  it("brouillon et essai signé ne créent aucun mois payant", () => {
    expect(calendrier({ contrats: [{ ...contrat, statut: "BROUILLON" }] })[1].montantCentimes).toBe(0);
  });
  it("fin du contrat incluse, puis plus de mois payant", () => {
    expect(calendrier({ contrats: [{ ...contrat, termineLe: d("2026-12-10") }] }).map((m) => m.montantCentimes)).toEqual([12345, 10876, 0, 0]);
  });
  it("cycles dédupliqués et formation unique du premier POC", () => {
    const suivant = { ...cycle, id: "b", debuteLe: d("2027-02-01") };
    expect(premierPoc([suivant, cycle, cycle])).toEqual(cycle);
    const c = calendrier({ cycles: [suivant, cycle, cycle] });
    expect(c[0].lignes.filter((l) => l.type === "FORMATION")).toHaveLength(1);
    expect(c[3].lignes.some((l) => l.type === "FORMATION_DEJA_DUE")).toBe(true);
    expect(c[3].montantCentimes).toBe(0);
  });
  it("pas de tarif signifie prix à renseigner, sans prix inventé", () => {
    expect(prixFormation({ id: null, tarifs: [] })).toEqual({ montantCentimes: null, grilleId: null });
    const c = calendrier({ formation: { ...formation, montantCentimes: null } });
    expect(c[0].montantCentimes).toBe(0);
    expect(c[0].lignes[0].prixARenseigner).toBe(true);
  });
  it("un prix explicite nul est connu", () => {
    expect(prixFormation({ id: 3, tarifs: [{ code: "FORMATION_POC", type: "PRESTATION", base: "PAR_ORGANISATION", montantHtCentimes: 0 }] })).toEqual({ montantCentimes: 0, grilleId: 3 });
  });
  it("refuse implicitement une base ou un type inadapté", () => {
    expect(prixFormation({ id: 3, tarifs: [{ code: "FORMATION_POC", type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: 123 }] }).montantCentimes).toBeNull();
  });
  it("une clé existante non attribuée à la formation exige une régularisation", () => {
    expect(regularisationFormation(formation, true)).toBe(true);
    expect(regularisationFormation(formation, false)).toBe(false);
    expect(regularisationFormation({ ...formation, comptabiliseeLe: d("2026-12-01") }, true)).toBe(false);
    expect(regularisationFormation({ ...formation, montantCentimes: null }, true)).toBe(false);
  });
  it("le calendrier signale le réel arrêté sans changer le montant dû", () => {
    const l = calendrier({ cleFormationDejaFigee: true })[0].lignes[0];
    expect(l.regularisation).toBe(true);
    expect(l.montantCentimes).toBe(12345);
  });
  it("prix tardif, clé absente : prochain arrêté seulement après la fin du mois", () => {
    expect(calendrier()[0].lignes[0].rattrapage).toBe(false);
    expect(calendrier({ maintenant: d("2027-01-10") })[0].lignes[0]).toMatchObject({ rattrapage: true, regularisation: false });
    expect(calendrier({ maintenant: d("2027-01-10"), cleFormationDejaFigee: true })[0].lignes[0]).toMatchObject({ rattrapage: false, regularisation: true });
    expect(calendrier({ maintenant: d("2027-01-10"), formation: { ...formation, comptabiliseeLe: d("2027-01-01") } })[0].lignes[0]).toMatchObject({ rattrapage: false, regularisation: false });
    expect(calendrier({ maintenant: d("2027-01-10"), formation: { ...formation, montantCentimes: null } })[0].lignes[0].rattrapage).toBe(false);
  });
  it("sans POC ni contrat les cases disent qu'il manque un calendrier", () => {
    expect(calendrier({ cycles: [], formation: null }).every((m) => m.lignes.length === 0)).toBe(true);
  });
  it("formation dans projection signée, pondérée et optimiste au seul mois du début", () => {
    const c = projeter({ contrats: [], opportunites: [], formations: [formation], scenario: null, variableMensuelleParLigne: new Map(), moisDepart: d("2026-11-01"), nbMois: 2 });
    expect(c.map((m) => [m.signe, m.pondere, m.optimiste, m.miseEnService])).toEqual([[12345, 12345, 12345, 12345], [0, 0, 0, 0]]);
  });
  it("réel hors contrat et agrégé avec les prestations de même clé", () => {
    const c = reelDuMois({ mois: d("2026-11-01"), contrats: [], formations: [{ ...formation, organisationId: 10 }], rattachements: [], usage: new Map() });
    expect(c.lignes).toHaveLength(1);
    expect(c.lignes[0]).toMatchObject({ cle: "2026-11|10|0|0", miseEnServiceCentimes: 12345, recurrentCentimes: 0 });
  });
  it("prix inconnu ne fige pas une clé à zéro qui empêcherait sa complétion", () => {
    expect(reelDuMois({ mois: d("2026-11-01"), contrats: [], formations: [{ ...formation, organisationId: 10, montantCentimes: null }], rattachements: [], usage: new Map() }).lignes).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { CrmCleEtape, CrmTiers } from "@prisma/client";
import { dateRealiste, ecartJours, joursEntre, type EtapeDateRealiste } from "./dateRealiste";

const maintenant = new Date("2026-11-10T15:00:00.000Z");
const jour = (n: number) => new Date(maintenant.getTime() + n * 86400000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const etape = (cle: CrmCleEtape, champs: Partial<EtapeDateRealiste> = {}): EtapeDateRealiste =>
  ({ cle, faite: false, creeLe: maintenant, echeanceLe: null, enAttenteDe: null, ...champs });
const passage = etape("PASSAGE_PRODUCTION", { faite: true });
const calcul = (...etapes: EtapeDateRealiste[]) => dateRealiste({ etapes, maintenant });

describe("dateRealiste, architecture §8.3", () => {
  it("étapes en parallèle : la plus longue fixe la date, à minuit UTC", () => {
    const r = calcul(etape("CODE_CENTRE"), etape("MAPPING_EXAMENS"), etape("FORMATION_SECRETAIRES"), passage);
    expect(r).toEqual({ date: new Date("2026-12-10T00:00:00.000Z"), resteJours: 30, etapeCritique: "MAPPING_EXAMENS" });
  });
  it("le temps écoulé depuis la création réduit le reste", () => {
    expect(calcul(etape("MAPPING_EXAMENS", { creeLe: jour(-10) }), passage).resteJours).toBe(20);
  });
  it("étape déjà en dépassement : il reste au moins un jour", () => {
    const r = calcul(etape("CODE_CENTRE", { creeLe: jour(-40) }), passage);
    expect(r).toMatchObject({ resteJours: 1, etapeCritique: "CODE_CENTRE" });
    expect(iso(r.date)).toBe("2026-11-11");
  });
  it("une échéance plus lointaine allonge le reste, plus proche ne le raccourcit pas", () => {
    expect(calcul(etape("CODE_CENTRE", { echeanceLe: jour(12) }), passage).resteJours).toBe(12);
    expect(calcul(etape("INTERFACAGE_TELEPHONIQUE", { echeanceLe: jour(3), enAttenteDe: "OPERATEUR_TELEPHONIE" }), passage).resteJours).toBe(21);
  });
  it.each(["EDL", "OPERATEUR_TELEPHONIE", "PRESTATAIRE_SITE_WEB"] as CrmTiers[])("tiers externe %s sans échéance : sept jours au moins", (tiers) => {
    expect(calcul(etape("VISIO_TECHNIQUE", { creeLe: jour(-30), enAttenteDe: tiers }), passage).resteJours).toBe(7);
  });
  it("tiers externe avec une échéance plus courte : l'échéance remplace la règle des sept jours", () => {
    expect(calcul(etape("VISIO_TECHNIQUE", { creeLe: jour(-30), enAttenteDe: "EDL", echeanceLe: jour(2) }), passage).resteJours).toBe(2);
  });
  it.each(["CLIENT", "LYRAE", "AUTRE"] as CrmTiers[])("%s n'est pas un tiers externe", (tiers) => {
    expect(calcul(etape("VISIO_TECHNIQUE", { creeLe: jour(-30), enAttenteDe: tiers }), passage).resteJours).toBe(1);
  });
  it("les étapes faites et non bloquantes ne comptent pas", () => {
    const r = calcul(etape("MAPPING_EXAMENS", { faite: true }), etape("PREMIERE_VISIO", { creeLe: jour(10) }), etape("PREMIER_APPEL_REEL"), etape("CODE_CENTRE"), passage);
    expect(r).toMatchObject({ resteJours: 7, etapeCritique: "CODE_CENTRE" });
  });
  it("passage en production non coché : sa durée s'ajoute, absent compte comme non coché", () => {
    expect(calcul(etape("MAPPING_EXAMENS"), etape("PASSAGE_PRODUCTION"))).toMatchObject({ resteJours: 37, etapeCritique: "MAPPING_EXAMENS" });
    expect(calcul(etape("MAPPING_EXAMENS")).resteJours).toBe(37);
  });
  it("seul le passage en production reste : il devient l'étape critique", () => {
    const r = calcul(etape("MAPPING_EXAMENS", { faite: true }), etape("PASSAGE_PRODUCTION"));
    expect(r).toEqual({ date: new Date("2026-11-17T00:00:00.000Z"), resteJours: 7, etapeCritique: "PASSAGE_PRODUCTION" });
  });
  it("tout est fait : la date est maintenant, rien de critique", () => {
    expect(calcul(etape("MAPPING_EXAMENS", { faite: true }), passage)).toEqual({ date: maintenant, resteJours: 0, etapeCritique: null });
    expect(calcul(passage)).toEqual({ date: maintenant, resteJours: 0, etapeCritique: null });
  });
  it("à égalité, l'ordre du référentiel tranche, pas l'ordre reçu", () => {
    // Mapping et réglages du robot attendent tous deux 30 jours (C-52).
    expect(calcul(etape("REGLAGES_ROBOT"), etape("MAPPING_EXAMENS"), passage).etapeCritique).toBe("MAPPING_EXAMENS");
  });
  it("bornes de jours UTC : une minute avant ou après minuit change le jour", () => {
    const tard = new Date("2026-11-10T23:59:00.000Z");
    const tot = new Date("2026-11-11T00:01:00.000Z");
    expect(joursEntre(tard, tot)).toBe(1);
    const creeLe = new Date("2026-11-05T23:59:00.000Z");
    expect(dateRealiste({ etapes: [etape("CODE_CENTRE", { creeLe }), passage], maintenant: tard }).resteJours).toBe(2);
    expect(dateRealiste({ etapes: [etape("CODE_CENTRE", { creeLe }), passage], maintenant: tot }).resteJours).toBe(1);
    expect(iso(dateRealiste({ etapes: [etape("CODE_CENTRE", { creeLe }), passage], maintenant: tot }).date)).toBe("2026-11-12");
    expect(dateRealiste({ etapes: [etape("CODE_CENTRE", { echeanceLe: new Date("2026-11-20T00:00:00.000Z") }), passage], maintenant: tard }).resteJours).toBe(10);
    expect(iso(dateRealiste({ etapes: [etape("CODE_CENTRE", { creeLe: tard }), passage], maintenant: tard }).date)).toBe("2026-11-17");
  });
  it("ne modifie pas les étapes reçues", () => {
    const etapes = [etape("REGLAGES_ROBOT"), etape("JETON_XPLORE")];
    const avant = JSON.stringify(etapes);
    dateRealiste({ etapes, maintenant });
    expect(JSON.stringify(etapes)).toBe(avant);
  });
});

describe("ecartJours", () => {
  it("signé, en jours civils UTC, nul sans date promise", () => {
    const realiste = new Date("2026-11-18T00:00:00.000Z");
    expect(ecartJours(realiste, new Date("2026-11-12T00:00:00.000Z"))).toBe(6);
    expect(ecartJours(realiste, new Date("2026-11-21T09:00:00.000Z"))).toBe(-3);
    expect(ecartJours(realiste, new Date("2026-11-18T23:59:00.000Z"))).toBe(0);
    expect(ecartJours(realiste, null)).toBeNull();
  });
});

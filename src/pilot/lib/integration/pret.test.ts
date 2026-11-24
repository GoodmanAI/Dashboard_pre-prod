import { describe, expect, it } from "vitest";
import type { CrmCleEtape } from "@prisma/client";
import { pret, type EtapePret } from "./pret";

const maintenant = new Date("2026-11-10T08:00:00.000Z");
const etape = (cle: CrmCleEtape, champs: Partial<EtapePret> = {}): EtapePret =>
  ({ cle, faite: false, motif: null, enAttenteDe: null, demandeeLe: null, ...champs });
const calcul = (...etapes: EtapePret[]) => pret({ etapes, maintenant });

describe("pret, architecture §8.5", () => {
  it("prêt quand aucune bloquante n'est ouverte, même si une non bloquante l'est", () => {
    expect(calcul(etape("MAPPING_EXAMENS", { faite: true }), etape("PREMIER_APPEL_REEL"), etape("PASSAGE_PRODUCTION"))).toEqual({ pret: true, manquantes: [] });
    expect(calcul()).toEqual({ pret: true, manquantes: [] });
  });
  it("le constat de l'évaluateur pour une étape automatique", () => {
    expect(calcul(etape("MAPPING_EXAMENS", { motif: "Mapping incomplet : 2 examens sur 5 attendus" })).manquantes).toEqual([{
      cle: "MAPPING_EXAMENS", libelle: "Examens associés entre Xplore et Lyrae", enAttenteDe: null, motif: "Mapping incomplet : 2 examens sur 5 attendus" }]);
  });
  it("l'attente déclarée, comptée en jours civils UTC", () => {
    const r = calcul(etape("INTERFACAGE_TELEPHONIQUE", { enAttenteDe: "OPERATEUR_TELEPHONIE", demandeeLe: new Date("2026-10-29T23:00:00.000Z"), motif: "Aucun numéro attribué au centre" }));
    expect(r.manquantes[0]).toMatchObject({ enAttenteDe: "OPERATEUR_TELEPHONIE", motif: "En attente de l'opérateur téléphonique depuis 12 jours" });
    expect(calcul(etape("FORMATION_SECRETAIRES", { enAttenteDe: "CLIENT", demandeeLe: new Date("2026-11-09T12:00:00.000Z") })).manquantes[0].motif).toBe("En attente du client depuis 1 jour");
    expect(calcul(etape("FORMATION_SECRETAIRES", { enAttenteDe: "CLIENT", demandeeLe: new Date("2026-11-10T00:00:00.000Z") })).manquantes[0].motif).toBe("En attente du client depuis aujourd'hui");
    expect(calcul(etape("FORMATION_SECRETAIRES", { enAttenteDe: "CLIENT" })).manquantes[0].motif).toBe("En attente du client");
  });
  it("étape mixte sans attente : le constat du volet automatique, sinon « À faire »", () => {
    expect(calcul(etape("INTERFACAGE_TELEPHONIQUE", { motif: "Aucun numéro attribué au centre" })).manquantes[0].motif).toBe("Aucun numéro attribué au centre");
    expect(calcul(etape("INTERFACAGE_TELEPHONIQUE")).manquantes[0].motif).toBe("À faire");
  });
  it("étape automatique sans constat ni attente, étape manuelle : « À faire »", () => {
    expect(calcul(etape("JETON_XPLORE"), etape("VISIO_TECHNIQUE")).manquantes.map((m) => m.motif)).toEqual(["À faire", "À faire"]);
  });
  it("ordre du référentiel, jamais l'ordre reçu", () => {
    const r = calcul(etape("FORMATION_SECRETAIRES"), etape("VISIO_TECHNIQUE"), etape("PASSAGE_PRODUCTION"), etape("JETON_XPLORE", { faite: true }), etape("CODE_CENTRE"));
    expect(r.pret).toBe(false);
    expect(r.manquantes.map((m) => m.cle)).toEqual(["VISIO_TECHNIQUE", "CODE_CENTRE", "FORMATION_SECRETAIRES"]);
  });
});

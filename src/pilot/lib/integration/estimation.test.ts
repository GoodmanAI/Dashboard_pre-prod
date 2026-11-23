import { describe, expect, it } from "vitest";
import { estimerRattachement, libelleCritique, libelleEcart, libelleRetard, manquantesCourtes, trierParEcart, type LigneEstimation } from "./estimation";

const maintenant = new Date("2026-11-10T12:00:00.000Z");
const ligne = (cle: LigneEstimation["cle"], champs: Partial<LigneEstimation> = {}): LigneEstimation =>
  ({ cle, faite: false, creeLe: maintenant, echeanceLe: null, enAttenteDe: null, ...champs });
const faites = (...cles: LigneEstimation["cle"][]) => cles.map((cle) => ligne(cle, { faite: true }));

describe("estimerRattachement", () => {
  it("une case absente est ouverte, une automatique jamais évaluée le dit", () => {
    const e = estimerRattachement({ produit: "LyraeTalk", lignes: [], datePromise: new Date("2026-11-15T00:00:00.000Z"), maintenant });
    expect(e).toMatchObject({ dateRealiste: "2026-12-17T00:00:00.000Z", resteJours: 37, ecartJours: 32, pret: false, enProduction: false, reserves: false,
      etapeCritique: { cle: "MAPPING_EXAMENS", libelle: "Examens associés entre Xplore et Lyrae", enAttenteDe: null } });
    expect(e.manquantes).toHaveLength(9);
    expect(e.manquantes.find((m) => m.cle === "TEST_CRENEAUX")?.motif).toBe("À faire");
    expect(e.manquantes.find((m) => m.cle === "JETON_XPLORE")?.motif).toBe("Pas encore vérifiée");
    expect(e.manquantes.find((m) => m.cle === "VISIO_TECHNIQUE")?.motif).toBe("À faire");
  });
  it("en production avec réserves, suivi renforcé en cours seulement", () => {
    const lignes = [...faites("VISIO_TECHNIQUE", "FORMATION_DASHBOARD", "TEST_CRENEAUX", "JETON_XPLORE", "CODE_CENTRE", "MAPPING_EXAMENS", "REGLAGES_ROBOT", "INTERFACAGE_TELEPHONIQUE", "PASSAGE_PRODUCTION"),
      ligne("FORMATION_SECRETAIRES", { enAttenteDe: "CLIENT", demandeeLe: new Date("2026-11-08T00:00:00.000Z") })];
    const mise = new Date("2026-11-07T12:00:00.000Z");
    const e = estimerRattachement({ produit: "LyraeTalk", lignes, datePromise: null, miseEnProductionLe: mise, suiviRenforceJusquAu: new Date("2026-11-21T12:00:00.000Z"), maintenant });
    expect(e).toMatchObject({ enProduction: true, reserves: true, pret: false, ecartJours: null, resteJours: 14,
      miseEnProductionLe: mise.toISOString(), suiviRenforceJusquAu: "2026-11-21T12:00:00.000Z" });
    expect(e.manquantes).toEqual([{ cle: "FORMATION_SECRETAIRES", libelle: "Secrétaires formées", enAttenteDe: "CLIENT", motif: "En attente du client depuis 2 jours" }]);
    expect(estimerRattachement({ produit: "LyraeTalk", lignes, datePromise: null, suiviRenforceJusquAu: maintenant, maintenant }).suiviRenforceJusquAu).toBeNull();
  });
  it("les étapes d'un autre produit ne comptent pas", () => {
    const e = estimerRattachement({ produit: "Konnect", lignes: [ligne("INTERFACAGE_TELEPHONIQUE", { echeanceLe: new Date("2027-06-01") })], datePromise: null, maintenant });
    expect(e.resteJours).toBe(37);
  });
});

describe("textes et tri", () => {
  it("écart, retard, étape critique et liste courte", () => {
    expect([6, 1, 0, -3, null].map(libelleEcart)).toEqual(["6 jours après la promesse", "1 jour après la promesse", "À la date promise", "3 jours d'avance", "Sans date promise"]);
    expect([6, 0, -1].map(libelleRetard)).toEqual(["6 jours de retard", "dans les temps", "1 jour d'avance"]);
    expect(libelleCritique({ cle: "JETON_XPLORE", libelle: "Jeton d'accès Xplore reçu d'EDL et testé", enAttenteDe: "EDL" })).toBe("Ce qui retarde le plus : Jeton d'accès Xplore reçu d'EDL et testé, en attente d'EDL");
    expect(libelleCritique({ cle: "PASSAGE_PRODUCTION", libelle: "Mise en service déclarée", enAttenteDe: null })).toBe("Ce qui retarde le plus : Mise en service déclarée");
    const m = (n: number) => Array.from({ length: n }, (_, i) => ({ cle: "CODE_CENTRE" as const, libelle: String(i), enAttenteDe: null, motif: "À faire" }));
    expect(manquantesCourtes(m(5))).toMatchObject({ suite: "et 2 autres" });
    expect(manquantesCourtes(m(4)).suite).toBe("et 1 autre");
    expect(manquantesCourtes(m(3))).toMatchObject({ suite: null });
    expect(manquantesCourtes(m(5)).visibles).toHaveLength(3);
  });
  it("plus en retard d'abord, sans date promise à la fin, puis date et identifiant", () => {
    const l = (id: number, ecartJours: number | null, datePromise: string | null = "2026-11-20") => ({ id, datePromise, estimation: { ecartJours } });
    const lignes = [l(1, 2), l(2, 12, "2026-11-22"), l(3, null, null), l(4, -3), l(5, 12, "2026-11-21"), l(6, 2)];
    expect(trierParEcart(lignes).map((x) => x.id)).toEqual([5, 2, 1, 6, 4, 3]);
    expect(lignes.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

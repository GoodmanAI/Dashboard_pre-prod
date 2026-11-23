import { describe, expect, it } from "vitest";
import type { CrmCleEtape } from "@prisma/client";
import { etapesDuProduit, rangPhase } from "./definition";
import { refusCochage } from "./gardes";

const date = new Date("2026-12-01T00:00:00Z");
const faites = (...cles: CrmCleEtape[]) => cles.map((cle) => ({ cle, faite: true }));
/** Toutes les cases du produit, faites, sauf celles nommées. */
const toutSauf = (produit: string, ...sauf: CrmCleEtape[]) =>
  etapesDuProduit(produit).map((e) => ({ cle: e.cle, faite: !sauf.includes(e.cle) }));

describe("pas d'« En service » avec une étape bloquante ouverte (C-92)", () => {
  it("la mise en service nomme ce qui reste, trois au plus", () => {
    expect(refusCochage({ cle: "PASSAGE_PRODUCTION", produit: "LyraeTalk", cases: toutSauf("LyraeTalk", "PASSAGE_PRODUCTION", "FORMATION_SECRETAIRES"), datePromise: null }))
      .toBe("Avant de déclarer la mise en service, il reste « Secrétaires formées ».");
    expect(refusCochage({ cle: "PASSAGE_PRODUCTION", produit: "LyraeTalk", cases: [], datePromise: null })).toMatch(/^Avant de déclarer la mise en service, il reste .+ et \d+ autres\.$/);
  });
  it("une étape automatique bloquante retient aussi la mise en service", () => {
    expect(refusCochage({ cle: "PASSAGE_PRODUCTION", produit: "LyraeTalk", cases: toutSauf("LyraeTalk", "PASSAGE_PRODUCTION", "JETON_XPLORE"), datePromise: null }))
      .toMatch(/^Avant de déclarer la mise en service, il reste « Jeton/);
  });
  it("ce qui suit la mise en service, ou n'est pas bloquant, ne la retient pas", () => {
    const apres = etapesDuProduit("LyraeTalk").filter((d) => d.depart === "MISE_EN_SERVICE" || !d.bloquante).map((d) => d.cle);
    expect(refusCochage({ cle: "PASSAGE_PRODUCTION", produit: "LyraeTalk", cases: toutSauf("LyraeTalk", ...apres), datePromise: null })).toBeNull();
  });
  it("une étape du lot V absente (déploiement d'avant le lot V) ne la retient pas", () => {
    const lotV = etapesDuProduit("LyraeTalk").filter((d) => d.lotV).map((d) => d.cle);
    const cases = toutSauf("LyraeTalk", "PASSAGE_PRODUCTION").filter((c) => !lotV.includes(c.cle));
    expect(refusCochage({ cle: "PASSAGE_PRODUCTION", produit: "LyraeTalk", cases, datePromise: null })).toBeNull();
  });
});

describe("gardes du lot V (C-85)", () => {
  it.each(["TOP_FACTURATION", "SUIVI_J1", "SUIVI_S1", "BILAN_M1", "ESSAI_VALIDE"] as const)("%s attend la mise en service", (cle) => {
    expect(refusCochage({ cle, produit: "LyraeTalk", cases: faites("PV_RECETTE"), datePromise: date }))
      .toBe("Cette étape suit la mise en service. Cochez d'abord « Mise en service déclarée ».");
    expect(refusCochage({ cle, produit: "LyraeTalk", cases: faites("PV_RECETTE", "PASSAGE_PRODUCTION"), datePromise: date })).toBeNull();
  });
  it("le top facturation part avec le PV", () => {
    const cases = [...faites("PASSAGE_PRODUCTION"), { cle: "PV_RECETTE" as const, faite: false }];
    expect(refusCochage({ cle: "TOP_FACTURATION", produit: "Konnect", cases, datePromise: null }))
      .toBe("Le top départ part avec le PV. Cochez d'abord « PV de recette signé par le client ».");
    // Mise en service antérieure au lot V : pas de case PV, rien à attendre.
    expect(refusCochage({ cle: "TOP_FACTURATION", produit: "Konnect", cases: faites("PASSAGE_PRODUCTION"), datePromise: null })).toBeNull();
  });
  it("la date de démarrage demande une date promise", () => {
    expect(refusCochage({ cle: "DATE_DEMARRAGE_CONFIRMEE", produit: "LyraeTalk", cases: toutSauf("LyraeTalk"), datePromise: null }))
      .toMatch(/pas de date promise/);
  });
  it("la date de démarrage nomme ce qui bloque avant elle, trois au plus", () => {
    expect(refusCochage({ cle: "DATE_DEMARRAGE_CONFIRMEE", produit: "LyraeTalk", cases: toutSauf("LyraeTalk", "VISIO_TECHNIQUE"), datePromise: date }))
      .toBe("Avant de confirmer la date, il reste « Visio technique : accès au RIS, agenda, opérateur téléphonique ».");
    const refus = refusCochage({ cle: "DATE_DEMARRAGE_CONFIRMEE", produit: "Konnect",
      cases: toutSauf("Konnect", "PARCOURS_PATIENT", "VISIO_TECHNIQUE", "JETON_XPLORE", "LECTURE_ORDONNANCE", "REGLES_EXAMENS"), datePromise: date });
    expect(refus).toBe("Avant de confirmer la date, il reste « Parcours patient validé par le client », « Visio technique : accès au RIS, agenda, opérateur téléphonique », « Jeton d'accès au RIS reçu de l'éditeur et testé » et 2 autres.");
  });
  it("une étape non bloquante, ou du go/no-go, ne retient pas la date", () => {
    expect(refusCochage({ cle: "DATE_DEMARRAGE_CONFIRMEE", produit: "LyraeTalk",
      cases: toutSauf("LyraeTalk", "PASSATION", "PREMIERE_VISIO", "PV_RECETTE", "PASSAGE_PRODUCTION"), datePromise: date })).toBeNull();
  });
  it("une étape du lot V absente (déploiement déjà en service) ne retient pas la date", () => {
    const cases = toutSauf("LyraeTalk").filter((c) => c.cle !== "PARCOURS_PATIENT");
    expect(refusCochage({ cle: "DATE_DEMARRAGE_CONFIRMEE", produit: "LyraeTalk", cases, datePromise: date })).toBeNull();
  });
  it("les autres étapes n'ont aucune garde", () => {
    for (const e of etapesDuProduit("LyraeTalk").filter((d) => d.depart === "OUVERTURE" && d.cle !== "DATE_DEMARRAGE_CONFIRMEE" && d.cle !== "PASSAGE_PRODUCTION")) {
      expect(refusCochage({ cle: e.cle, produit: "LyraeTalk", cases: [], datePromise: null })).toBeNull();
    }
    expect(rangPhase("GO_NO_GO")).toBe(4);
  });
});

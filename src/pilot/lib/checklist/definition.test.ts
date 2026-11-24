import { expect, it } from "vitest";
import { CHECKLIST, cochableALaMain, definitionEtape, etapesDuProduit, etapesSuivies, rangPhase } from "./definition";

it.each(CHECKLIST.filter((e) => e.mode === "AUTOMATIQUE"))("refuse le cochage manuel de $cle", (etape) => {
  expect(cochableALaMain(etape.cle)).toBe(false);
});

it.each(CHECKLIST.filter((e) => e.mode !== "AUTOMATIQUE"))("autorise le volet humain de $cle", (etape) => {
  expect(cochableALaMain(etape.cle)).toBe(true);
});

it("NoShow a ses deux étapes, sans test de créneaux ni premier appel (C-56)", () => {
  const cles = etapesDuProduit("NoShow").map((e) => e.cle);
  expect(cles).toEqual(expect.arrayContaining(["MESSAGES_RAPPEL", "PREMIER_RAPPEL", "JETON_XPLORE", "PASSAGE_PRODUCTION"]));
  expect(cles).not.toContain("TEST_CRENEAUX");
  expect(cles).not.toContain("PREMIER_APPEL_REEL");
  expect(etapesDuProduit("LyraeTalk").map((e) => e.cle)).not.toContain("MESSAGES_RAPPEL");
});

it("chaque étape a une phase, et le référentiel est rangé par phase (C-85)", () => {
  const rangs = CHECKLIST.map((e) => rangPhase(e.phase));
  expect(rangs.every((r) => r >= 0)).toBe(true);
  expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  expect(new Set(CHECKLIST.map((e) => e.cle)).size).toBe(CHECKLIST.length);
});

it("Konnect a ses libellés, ses règles d'examens et ses secrétaires, sans ligne téléphonique (C-85)", () => {
  const konnect = etapesDuProduit("LyraeKonnect");
  const cles = konnect.map((e) => e.cle);
  expect(cles).toEqual(expect.arrayContaining(["REGLES_EXAMENS", "LECTURE_ORDONNANCE", "MESSAGES_PATIENTS", "FORMATION_SECRETAIRES", "INTEGRATION_SITE_WEB"]));
  expect(cles).not.toContain("INTERFACAGE_TELEPHONIQUE");
  expect(cles).not.toContain("REGLAGES_ROBOT");
  expect(konnect.find((e) => e.cle === "PREMIER_APPEL_REEL")?.libelle).toBe("Premier rendez-vous pris en ligne via ordonnance");
  expect(definitionEtape("TEST_CRENEAUX", "LyraeKonnect").libelle).toBe("Créneaux en ligne testés : Konnect voit le vrai planning");
  expect(definitionEtape("TEST_CRENEAUX", "LyraeTalk").libelle).toBe("Créneaux testés : le robot voit le vrai planning");
  expect(etapesDuProduit("LyraeTalk").map((e) => e.cle)).not.toContain("LECTURE_ORDONNANCE");
});

it("le suivi et le top facturation partent de la mise en service, sans bloquer", () => {
  const apres = CHECKLIST.filter((e) => e.depart === "MISE_EN_SERVICE").map((e) => e.cle);
  expect(apres).toEqual(["TOP_FACTURATION", "SUIVI_J1", "SUIVI_S1", "BILAN_M1", "ESSAI_VALIDE"]);
  expect(CHECKLIST.filter((e) => e.depart === "MISE_EN_SERVICE").every((e) => !e.bloquante && e.lotV)).toBe(true);
});

it("une étape du lot V sans case n'est pas suivie, les autres le sont toujours", () => {
  const suivies = etapesSuivies("LyraeTalk", () => false).map((e) => e.cle);
  expect(suivies).toContain("PREMIERE_VISIO");
  expect(suivies).not.toContain("PV_RECETTE");
  expect(etapesSuivies("LyraeTalk", (c) => c === "PV_RECETTE").map((e) => e.cle)).toContain("PV_RECETTE");
});

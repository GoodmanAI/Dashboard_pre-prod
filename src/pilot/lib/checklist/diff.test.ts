import { describe, expect, it } from "vitest";
import type { CrmCleEtape, CrmEtapeIntegration } from "@prisma/client";
import type { EtatComplétude } from "@/pilot/lib/completude/adapter";
import { CHECKLIST, definitionEtape } from "./definition";
import { creationDifferee, diffEtapes, MOTIF_SANS_CHEF, MOTIF_SANS_FACTURATION, SANS_COMPTE, verdictAutomatique, verdictPilot } from "./diff";
const tousFaits = { contactFacturation: true, chefDeProjet: true };

const maintenant = new Date("2026-10-26T12:00:00Z");
const ancienne = new Date("2026-10-03T12:00:00Z");
const etat: EtatComplétude = { jetonXploreValide: true, codeCentreRattache: true, mappingExamensTermine: true,
  reglagesRobotValides: true, premierAppelReel: true, numeroPose: true, dernierAppelLe: ancienne, statutCentre: "EN_PRODUCTION", motifs: {} };
function ligne(cle: CrmCleEtape, p: Partial<CrmEtapeIntegration> = {}): CrmEtapeIntegration {
  return { id: 1, centreId: 1, productId: 1, cle, mode: definitionEtape(cle).mode, faite: false, faiteLe: null,
    auteurId: null, commentaire: null, motif: null, evalueeLe: ancienne, creeLe: ancienne, majLe: ancienne,
    enAttenteDe: null, demandeeLe: null, derniereRelanceLe: null, echeanceLe: null, ...p };
}
const diff = (e: CrmEtapeIntegration, registre: EtatComplétude | null = etat) => diffEtapes({ definitions: [definitionEtape(e.cle)], existantes: [e], etat: registre, maintenant });

describe("table des verdicts du registre", () => {
  it.each([
    ["JETON_XPLORE", "jetonXploreValide"], ["CODE_CENTRE", "codeCentreRattache"], ["MAPPING_EXAMENS", "mappingExamensTermine"],
    ["REGLAGES_ROBOT", "reglagesRobotValides"], ["PREMIER_APPEL_REEL", "premierAppelReel"],
  ] as const)("%s reprend son verdict et son motif", (cle, champ) => {
    expect(verdictAutomatique(cle, etat)).toEqual({ faite: true, motif: undefined });
    expect(verdictAutomatique(cle, { ...etat, [champ]: false, motifs: { [champ]: "Motif du registre" } }))
      .toEqual({ faite: false, motif: "Motif du registre" });
  });
  it("le numéro ne conclut pas les essais", () => {
    expect(verdictAutomatique("INTERFACAGE_TELEPHONIQUE", etat)).toBeNull();
    expect(verdictAutomatique("INTERFACAGE_TELEPHONIQUE", { ...etat, numeroPose: false, motifs: { numeroPose: "Numéro absent" } }))
      .toEqual({ faite: false, motif: "Numéro absent" });
  });
  it.each(CHECKLIST.filter((d) => d.mode === "MANUEL"))("aucun verdict pour $cle", (d) => {
    expect(verdictAutomatique(d.cle, etat)).toBeNull();
  });
});

describe("diffEtapes", () => {
  it.each(CHECKLIST)("crée $cle selon son mode", (d) => {
    const resultat = diffEtapes({ definitions: [d], existantes: [], etat, maintenant, faitsPilot: tousFaits });
    expect(resultat.creations).toEqual([{ cle: d.cle, mode: d.mode, faite: d.mode === "AUTOMATIQUE",
      faiteLe: d.mode === "AUTOMATIQUE" ? maintenant : null, motif: null, evalueeLe: d.mode === "MANUEL" ? null : maintenant }]);
    expect(resultat.misesAJour).toEqual([]);
  });
  it("crée les cases sans compte avec un motif, sauf les manuelles", () => {
    const { creations } = diffEtapes({ definitions: CHECKLIST, existantes: [], etat: null, maintenant });
    expect(creations).toHaveLength(CHECKLIST.length);
    for (const e of creations) {
      expect(e.faite).toBe(false); expect(e.faiteLe).toBeNull();
      const attendu = e.cle === "CONTACTS_FACTURATION" ? MOTIF_SANS_FACTURATION : e.cle === "RESPONSABLE_DESIGNE" ? MOTIF_SANS_CHEF : SANS_COMPTE;
      expect(e.motif).toBe(e.mode === "MANUEL" ? null : attendu);
      expect(e.evalueeLe).toEqual(e.mode === "MANUEL" ? null : maintenant);
    }
  });
  it("crée une automatique vide et une mixte vide avec le motif du registre", () => {
    const { creations } = diffEtapes({ definitions: [definitionEtape("MAPPING_EXAMENS"), definitionEtape("INTERFACAGE_TELEPHONIQUE")],
      existantes: [], etat: { ...etat, numeroPose: false, mappingExamensTermine: false, motifs: { numeroPose: "Numéro absent", mappingExamensTermine: "Mapping incomplet" } }, maintenant });
    expect(creations.map((e) => [e.faite, e.faiteLe, e.motif])).toEqual([[false, null, "Mapping incomplet"], [false, null, "Numéro absent"]]);
  });
  it.each(CHECKLIST.filter((d) => d.mode === "MANUEL"))("ne touche jamais $cle, même sans compte", (d) => {
    const e = Object.freeze(ligne(d.cle, { faite: true, faiteLe: ancienne, motif: "Motif conservé", commentaire: "Présents privés",
      enAttenteDe: "EDL", demandeeLe: ancienne, derniereRelanceLe: ancienne, echeanceLe: maintenant }));
    for (const registre of [etat, null]) expect(diff(e, registre)).toEqual({ creations: [], misesAJour: [], regressions: [], inchangees: [] });
  });
  it("faux vers vrai date le fait maintenant", () => {
    const e = ligne("MAPPING_EXAMENS", { motif: "Mapping incomplet", faiteLe: ancienne });
    expect(diff(e).misesAJour[0].data).toEqual({ faite: true, faiteLe: maintenant, motif: null, auteurId: null, evalueeLe: maintenant });
  });
  it("journalise la régression avec la date historique", () => {
    const e = ligne("MAPPING_EXAMENS", { faite: true, faiteLe: ancienne });
    const r = diff(e, { ...etat, mappingExamensTermine: false, motifs: { mappingExamensTermine: "Mapping incomplet" } });
    expect(r.regressions).toEqual([{ id: e.id, avant: { faite: true, faiteLe: ancienne }, apres: { faite: false, motif: "Mapping incomplet" } }]);
    expect(r.misesAJour[0].data.faiteLe).toBeNull();
  });
  it("la disparition du compte est une régression automatique", () => {
    const e = ligne("JETON_XPLORE", { faite: true, faiteLe: ancienne });
    expect(diff(e, null).regressions).toEqual([{ id: 1, avant: { faite: true, faiteLe: ancienne }, apres: { faite: false, motif: SANS_COMPTE } }]);
  });
  it("isole les ids inchangés pour un updateMany unique", () => {
    const e = ligne("JETON_XPLORE", { faite: true, faiteLe: ancienne });
    expect(diff(e)).toEqual({ creations: [], misesAJour: [], regressions: [], inchangees: [e.id] });
    expect(diff(ligne("JETON_XPLORE", { motif: SANS_COMPTE }), null).inchangees).toEqual([1]);
  });
  it("un motif modifié conserve la date de réalisation", () => {
    expect(diff(ligne("JETON_XPLORE", { faite: true, faiteLe: ancienne, motif: "Ancien motif" })).misesAJour[0].data.faiteLe).toEqual(ancienne);
  });
  it.each([false, true])("la mixte faite=%s conserve tous les champs humains", (faite) => {
    const e = ligne("INTERFACAGE_TELEPHONIQUE", { faite, faiteLe: faite ? ancienne : null, auteurId: 8, commentaire: "Présents privés", enAttenteDe: "CLIENT", demandeeLe: ancienne });
    const copie = structuredClone(e);
    for (const registre of [null, { ...etat, numeroPose: false, motifs: { numeroPose: "Numéro absent" } }]) {
      const r = diff(e, registre);
      expect(Object.keys(r.misesAJour[0].data).sort()).toEqual(["evalueeLe", "motif"]);
      expect(r.regressions).toEqual([]);
    }
    expect(diff({ ...e, motif: "Numéro absent" }).misesAJour[0].data).toEqual({ evalueeLe: maintenant, motif: null });
    expect(e).toEqual(copie);
  });
  it("une ligne stockée MANUEL ne devient jamais automatique", () => {
    expect(diff(ligne("JETON_XPLORE", { mode: "MANUEL" })).misesAJour).toEqual([]);
  });
});

describe("lot V (C-85)", () => {
  it("les étapes constatées par Pilot ignorent le compte Dashboard", () => {
    expect(verdictPilot("CONTACTS_FACTURATION", tousFaits)).toEqual({ faite: true });
    expect(verdictPilot("RESPONSABLE_DESIGNE", { contactFacturation: true, chefDeProjet: false })).toEqual({ faite: false, motif: MOTIF_SANS_CHEF });
    expect(verdictPilot("JETON_XPLORE", tousFaits)).toBeNull();
    const { creations } = diffEtapes({ definitions: [definitionEtape("CONTACTS_FACTURATION")], existantes: [], etat: null, maintenant, faitsPilot: tousFaits });
    expect(creations[0]).toMatchObject({ faite: true, motif: null });
  });
  it("une étape constatée par Pilot régresse quand le contact facturation disparaît", () => {
    const e = ligne("CONTACTS_FACTURATION", { faite: true, faiteLe: ancienne });
    const resultat = diffEtapes({ definitions: [definitionEtape(e.cle)], existantes: [e], etat, maintenant });
    expect(resultat.regressions).toHaveLength(1);
    expect(resultat.misesAJour[0].data).toMatchObject({ faite: false, motif: MOTIF_SANS_FACTURATION });
  });
  const passage = (faiteLe: Date | null) => ligne("PASSAGE_PRODUCTION", { id: 9, faite: true, faiteLe });
  it("un déploiement pas encore en service reçoit tout le lot V", () => {
    const { creations } = diffEtapes({ definitions: CHECKLIST, existantes: [], etat, maintenant });
    expect(creations).toHaveLength(CHECKLIST.length);
  });
  it("un déploiement en service depuis longtemps ne reçoit aucune étape du lot V", () => {
    const { creations } = diffEtapes({ definitions: CHECKLIST, existantes: [passage(new Date("2026-01-01T00:00:00Z"))], etat, maintenant });
    expect(creations.filter((c) => definitionEtape(c.cle).lotV)).toEqual([]);
    expect(creations.map((c) => c.cle)).toContain("PREMIERE_VISIO");
  });
  it("une mise en service récente reçoit le top facturation et le suivi, pas le reste", () => {
    const { creations } = diffEtapes({ definitions: CHECKLIST, existantes: [passage(new Date("2026-10-20T00:00:00Z"))], etat, maintenant });
    const lotV = creations.filter((c) => definitionEtape(c.cle).lotV).map((c) => c.cle).sort();
    expect(lotV).toEqual(["BILAN_M1", "ESSAI_VALIDE", "SUIVI_J1", "SUIVI_S1", "TOP_FACTURATION"]);
  });
  it("30 jours pile ne suffisent plus, une mise en service sans date non plus", () => {
    expect(creationDifferee(definitionEtape("SUIVI_J1"), [passage(new Date(maintenant.getTime() - 30 * 86400000))], maintenant)).toBe(true);
    expect(creationDifferee(definitionEtape("SUIVI_J1"), [passage(null)], maintenant)).toBe(true);
    expect(creationDifferee(definitionEtape("PREMIERE_VISIO"), [passage(null)], maintenant)).toBe(false);
    expect(creationDifferee(definitionEtape("PV_RECETTE"), [ligne("PASSAGE_PRODUCTION", { faite: false })], maintenant)).toBe(false);
  });
});

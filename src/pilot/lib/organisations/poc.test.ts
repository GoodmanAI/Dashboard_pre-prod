import { describe, expect, it } from "vitest";
import { cheminVersSigne, estClient, rubriqueDe, suitLaMiseEnService, transitionPermise } from "@/pilot/lib/pipeline";
import { DEBUT_POC_REQUIS, DEBUT_NOUVEAU_POC_REQUIS, datesNouveauCyclePoc, entreeCyclePoc, issueCloturePoc, libellePocPrecedent, finPocADecider, finPrevuePoc, POC_DEJA_PROLONGE, refusDebutPoc, refusProlongationPoc, refusActivationPendantPoc } from "./poc";
import { donneesCycleClos } from "./cyclesPoc";
import { calculerAlertes } from "@/pilot/lib/alertes/calculer";
import type { DonneesAlertes, OrganisationAlertes } from "@/pilot/lib/alertes/types";
const date = (v: string) => new Date(v + "T00:00:00Z");
const debut = { pocDebuteLe: date("2026-11-03"), pocProlongeLe: null };

describe("POC avant signature", () => {
  it.each([
    ["PROPOSITION", "EN_POC", true], ["PROPOSITION", "SIGNE", true], ["EN_POC", "SIGNE", true],
    ["EN_POC", "PROPOSITION", true], ["PROSPECT", "EN_POC", false], ["EN_POC", "EN_PRODUCTION", false],
    ["SIGNE", "EN_POC", false],
    ["EN_POC", "POC_NON_TRANSFORME", true], ["POC_NON_TRANSFORME", "PROSPECT", true],
    ["POC_NON_TRANSFORME", "SIGNE", false], ["PROSPECT", "POC_NON_TRANSFORME", false],
  ] as const)("%s vers %s = %s", (de, vers, permis) => expect(transitionPermise(de, vers)).toBe(permis));
  it("convertit le POC par le chemin existant, sans l'imposer au devis", () => {
    expect(cheminVersSigne("EN_POC")).toEqual(["SIGNE"]);
    expect(cheminVersSigne("PROPOSITION")).toEqual(["SIGNE"]);
    expect(cheminVersSigne("POC_NON_TRANSFORME")).toBeNull();
  });
  it.each(["EN_POC", "POC_NON_TRANSFORME"] as const)("%s reste prospect", (e) => {
    expect(estClient(e)).toBe(false); expect(rubriqueDe(e)).toBe("prospects");
  });
  it("suit les centres du POC, plus ceux du POC non transformé", () => {
    expect(suitLaMiseEnService("EN_POC")).toBe(true);
    expect(suitLaMiseEnService("POC_NON_TRANSFORME")).toBe(false);
  });
  it("exige un début et conserve les dates déjà enregistrées", () => {
    expect(refusDebutPoc({}, "EN_POC", "NOUVEAU")).toBe(DEBUT_POC_REQUIS);
    expect(refusDebutPoc({}, "EN_POC", "NOUVEAU", debut.pocDebuteLe)).toBeNull();
    expect(refusDebutPoc(debut, "EN_POC", "MEME")).toBeNull();
    expect(refusDebutPoc(debut, "EN_POC", "MEME", date("2026-11-04"))).toContain("déjà enregistrée");
  });
  it.each([
    ["2026-11-03", false, "2026-12-02"], ["2026-11-03", true, "2027-01-02"],
    ["2026-01-31", false, "2026-02-27"], ["2028-01-31", false, "2028-02-28"],
    ["2026-12-31", true, "2027-02-27"],
  ])("%s, prolongé %s : dernier jour %s", (le, prolonge, fin) => {
    expect(finPrevuePoc({ pocDebuteLe: date(le as string), pocProlongeLe: prolonge ? date("2026-11-20") : null })).toEqual(date(fin as string));
  });
  it("ne calcule rien sans début", () => expect(finPrevuePoc({})).toBeNull());
  it("un POC ne porte pas de chiffre signé : activer son contrat exige de le valider", () => {
    expect(refusActivationPendantPoc("EN_POC")).toContain("Validez d'abord");
    expect(refusActivationPendantPoc("SIGNE")).toBeNull();
  });
  it("autorise une prolongation et refuse la seconde avec sa raison", () => {
    expect(refusProlongationPoc({ ...debut, etape: "EN_POC" })).toBeNull();
    expect(refusProlongationPoc({ ...debut, etape: "EN_POC", pocProlongeLe: date("2026-11-20") })).toBe(POC_DEJA_PROLONGE);
    expect(refusProlongationPoc({ ...debut, etape: "SIGNE" })).toContain("Seul un POC en cours");
  });
  it.each([["2026-11-24", false], ["2026-11-25", true], ["2026-12-10", true]] as const)("alerte le %s : %s", (le, ouverte) => {
    expect(finPocADecider({ ...debut, etape: "EN_POC" }, date(le)) !== null).toBe(ouverte);
  });
  it.each(["SIGNE", "POC_NON_TRANSFORME", "PROSPECT"] as const)("alerte fermée après décision %s", (etape) => {
    expect(finPocADecider({ ...debut, etape }, date("2026-12-10"))).toBeNull();
  });
  it("une prolongation décale l'alerte jusqu'au nouveau J-7", () => {
    const p = { ...debut, etape: "EN_POC" as const, pocProlongeLe: date("2026-11-25") };
    expect(finPocADecider(p, date("2026-11-25"))).toBeNull();
    expect(finPocADecider(p, date("2026-12-26"))).toEqual(date("2027-01-02"));
  });
  it("alerte commerciale attribuée au DG, sans montant et vers la fiche", () => {
    const org: OrganisationAlertes = { ...debut, id: 1, raisonSocialeNom: "Cabinet Test", etape: "EN_POC", etapeDepuisLe: debut.pocDebuteLe,
      creeLe: debut.pocDebuteLe, prochaineActionLe: null, reveilLe: null, decisionAttendueLe: null, dernierEchangeLe: null, responsableId: null, chefDeProjetId: null, contratActif: false };
    const d: DonneesAlertes = { organisations: [org], rattachements: [], etapes: [], datesPromises: [], regressions: [], contrats: [], propositions: [], acquittements: [],
      parDefaut: { id: 7, nom: "Direction", departement: "DIRECTION", designe: true } };
    const a = calculerAlertes(d, date("2026-11-25")).actives.find((a) => a.type === "fin-poc");
    expect(a).toMatchObject({ famille: "commerciale", lien: "/pilot/organisations/1", attribution: { userId: 7, poste: "Direction générale" } });
    expect(a?.detail).toContain("validé"); expect(a?.detail).toContain("prolongé"); expect(a?.detail).toContain("non transformé");
    expect(JSON.stringify(a)).not.toMatch(/€|centimes|montant/);
    expect(calculerAlertes(d, date("2026-11-25")).actives.some((a) => a.type === "contrat-a-saisir")).toBe(false);
  });
});

describe("C-94 : un cycle par POC", () => {
  it.each([
    ["PROPOSITION", null, false, "NOUVEAU"],
    ["EN_POC", null, true, "MEME"],
    ["EN_SOMMEIL", "EN_POC", true, "MEME"],
    ["PERDU", "EN_POC", true, "MEME"],
    ["POC_NON_TRANSFORME", "EN_POC", false, "NOUVEAU"],
    ["EN_SOMMEIL", "EN_POC", false, "NOUVEAU"],
    ["PERDU", "EN_POC", false, "NOUVEAU"],
  ] as const)("depuis %s, avant sortie %s, ouvert %s : %s", (depuis, avantSortie, ouvert, attendu) => {
    expect(transitionPermise(depuis, "EN_POC", avantSortie)).toBe(true);
    expect(entreeCyclePoc(depuis, "EN_POC", avantSortie, ouvert)).toBe(attendu);
  });
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL", "POC_NON_TRANSFORME"] as const)(
    "%s ne peut pas entrer en POC sans le chemin de reprise", (depuis) => {
      expect(entreeCyclePoc(depuis, "EN_POC", null, false)).toBeNull();
      expect(entreeCyclePoc(depuis, "EN_POC", "PROPOSITION", true)).toBeNull();
    });
  it("exige une date au nouveau cycle, même si le précédent avait des dates", () => {
    const precedent = { ...debut, pocProlongeLe: date("2026-11-25") };
    expect(refusDebutPoc(precedent, "EN_POC", "NOUVEAU")).toBe(DEBUT_NOUVEAU_POC_REQUIS);
    expect(refusDebutPoc(precedent, "EN_POC", "NOUVEAU", date("2027-06-01"))).toBeNull();
    expect(refusDebutPoc(precedent, "EN_POC", "MEME")).toBeNull();
    expect(refusDebutPoc(precedent, "EN_POC", "MEME", date("2027-06-01"))).not.toBeNull();
  });
  it("rend une prolongation disponible sur le nouveau cycle, puis refuse encore la seconde", () => {
    const ancien = { ...debut, pocProlongeLe: date("2026-11-25") };
    const nouveau = { ...datesNouveauCyclePoc(date("2027-06-01")), etape: "EN_POC" as const };
    expect(nouveau.pocProlongeLe).toBeNull();
    expect(refusProlongationPoc(nouveau)).toBeNull();
    expect(refusProlongationPoc({ ...nouveau, pocProlongeLe: date("2027-06-25") })).toBe(POC_DEJA_PROLONGE);
    expect(ancien.pocProlongeLe).toEqual(date("2026-11-25"));
  });
  it("le POC passé ne déclenche pas l'alerte du nouveau cycle", () => {
    const maintenant = date("2027-06-01");
    const ancien = { ...debut, etape: "EN_POC" as const, pocProlongeLe: date("2026-11-25") };
    const courant = { ...datesNouveauCyclePoc(maintenant), etape: "EN_POC" as const };
    expect(finPocADecider(ancien, maintenant)).not.toBeNull();
    expect(finPrevuePoc(courant)).toEqual(date("2027-06-30"));
    expect(finPocADecider(courant, maintenant)).toBeNull();
    expect(finPocADecider(courant, date("2027-06-23"))).toEqual(date("2027-06-30"));
  });
  it("le report d'une ancienne alerte n'acquitte pas celle du nouveau cycle, qui garde sa cause", () => {
    const org: OrganisationAlertes = { id: 1, raisonSocialeNom: "Cabinet Test", etape: "EN_POC", pocCycleId: "cycle-juin", pocDebuteLe: date("2027-06-01"), pocProlongeLe: null,
      etapeDepuisLe: date("2027-06-01"), creeLe: date("2026-01-01"), prochaineActionLe: date("2027-07-01"), reveilLe: null, decisionAttendueLe: null, dernierEchangeLe: date("2027-06-20"), responsableId: null, chefDeProjetId: null };
    const d: DonneesAlertes = { organisations: [org], rattachements: [], etapes: [], datesPromises: [], regressions: [], contrats: [], propositions: [],
      acquittements: [{ id: 9, organisationId: 1, cleAlerte: "fin-poc-1-cycle-decembre", jusquAu: date("2027-08-01"), raison: "Report", auteur: null }] };
    const resultat = calculerAlertes(d, date("2027-06-23"));
    expect(resultat.actives.find((a) => a.type === "fin-poc")).toMatchObject({ cle: "fin-poc-1-cycle-juin", groupe: "fin-poc-1" });
    expect(resultat.acquittees.some((a) => a.type === "fin-poc")).toBe(false);
  });
  it.each([
    ["SIGNE", "VALIDE"], ["POC_NON_TRANSFORME", "NON_TRANSFORME"],
    ["PROPOSITION", "RETOUR_PROPOSITION"], ["PROSPECT", "RETOUR_PROSPECTION"],
  ] as const)("la décision %s archive immédiatement l'issue %s et ses dates", (vers, issue) => {
    expect(issueCloturePoc(true, vers)).toBe(issue);
    const decideLe = date("2026-12-02");
    const org = { ...debut, id: 3, pocCycleId: "c169d4fa-6dec-4f70-824c-3609e7c3b785", pocProlongeLe: date("2026-11-25") };
    const archive = donneesCycleClos(org, issue, decideLe);
    expect(archive).toEqual({ id: org.pocCycleId, organisationId: 3, debuteLe: debut.pocDebuteLe, prolongeLe: date("2026-11-25"), issue, decideLe });
    expect(issueCloturePoc(false, vers)).toBeNull();
  });
  it.each(["EN_POC", "EN_SOMMEIL", "PERDU"] as const)("%s ne clôt pas un cycle qui peut être repris", (vers) => {
    expect(issueCloturePoc(true, vers)).toBeNull();
  });
  it("la ligne précédente utilise les dates et l'issue du cycle clos", () => {
    expect(libellePocPrecedent({ debuteLe: date("2026-12-01"), prolongeLe: null, issue: "NON_TRANSFORME" }))
      .toBe("POC précédent : du 01/12/2026 au 31/12/2026, non transformé.");
  });
});

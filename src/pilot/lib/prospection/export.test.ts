import { describe, expect, it } from "vitest";
import { construireCsvProspects, contactPrincipal, EN_TETE_PROSPECTS, ligneProspect, nomFichierProspects, resumeCentres, type DossierExport } from "./export";

const d = (s: string) => new Date(s);
const dossier = (surcharge: Partial<DossierExport> = {}): DossierExport => ({
  id: 7, nom: "Centre d'imagerie Alpha", type: "CABINET", etape: "POURPARLERS", etapeDepuisLe: d("2026-11-02T10:00:00Z"),
  priorite: "A_PLUS", temperature: "CHAUD", temperatureForcee: true, responsable: "Camille Beta", chefDeProjet: null,
  origine: "SALON", rattachementGht: null, telephone: "+33 1 23 45 67 89", email: "contact@alpha.test", siteWeb: null,
  ris: "Xplore (EDL)", risVersion: null, outilRdv: "Doctolib", solutionActuelle: null, concurrent: "Gamma",
  nombreSites: 2, nombreSalles: null, nombreIrm: 1, nombreScanners: null, nombreRadio: null, nombreEcho: null, nombreMammo: null,
  nombreSecretaires: 4, volumeAppelsEstime: null, blocagesTechniques: ["RESEAU"],
  qualifBesoin: true, qualifDecideur: false, qualifBudget: false, qualifCalendrier: false, qualifSolutionActuelle: false,
  decisionAttendueLe: null, dernierEchangeLe: d("2026-11-10T00:00:00Z"), prochaineAction: "Rappeler", prochaineActionLe: null,
  produits: ["Talk"], mensuelEstimeCentimes: 123456, miseEnServiceEstimeeCentimes: 0,
  raisonSortieCode: null, raisonSortie: null, dateSortie: null, concurrentGagnant: null, reveilLe: null,
  notes: null, creeLe: d("2026-10-01T00:00:00Z"),
  contacts: [
    { nom: "Dominique Delta", fonction: "Secrétaire", email: null, telephone: null, roleDecision: "UTILISATEUR", attitude: "NEUTRE", principal: false },
    { nom: "Sacha Epsilon", fonction: "Gérant", email: "s@alpha.test", telephone: null, roleDecision: "DECIDEUR", attitude: "SOUTIEN", principal: true },
  ],
  centres: [{ nom: "Nord", adresse: "1 rue A", codePostal: "75001", ville: "Paris", ris: null }, { nom: "Sud", adresse: null, codePostal: null, ville: null, ris: null }],
  ...surcharge,
});

describe("export des prospects", () => {
  it("écrit autant de colonnes que l'en-tête", () => {
    expect(ligneProspect(dossier()).split(";")).toHaveLength(EN_TETE_PROSPECTS.length);
  });
  it("met les libellés, les montants en euros et les dates en AAAA-MM-JJ", () => {
    const ligne = ligneProspect(dossier());
    for (const attendu of [`"Premiers échanges"`, `"A+"`, `"Chaud (forcée)"`, `"Salon (JFR, SantExpo, Medin)"`, "1234,56", "2026-11-10", `"'+33 1 23 45 67 89"`])
      expect(ligne).toContain(attendu);
  });
  it("prend le contact principal, sinon le premier, et résume les autres", () => {
    expect(contactPrincipal(dossier().contacts)?.nom).toBe("Sacha Epsilon");
    expect(contactPrincipal(dossier({ contacts: dossier().contacts.map((c) => ({ ...c, principal: false })) }).contacts)?.nom).toBe("Dominique Delta");
    expect(ligneProspect(dossier())).toContain(`"Dominique Delta (Secrétaire, Utilisateur, Neutre)"`);
  });
  it("résume les sites", () => {
    expect(resumeCentres(dossier().centres)).toBe("Nord : 1 rue A, 75001 Paris | Sud");
  });
  it("produit un fichier UTF-8 avec BOM et CRLF, en-tête seul sans dossier", () => {
    expect(construireCsvProspects([])).toBe("﻿" + EN_TETE_PROSPECTS.join(";") + "\r\n");
    expect(nomFichierProspects(d("2026-11-20T08:00:00Z"))).toBe("pilot-prospects-2026-11-20.csv");
  });
});

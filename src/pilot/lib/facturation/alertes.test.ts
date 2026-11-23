import { describe, expect, it } from "vitest";
import { calculerAlertes } from "@/pilot/lib/alertes/calculer";
import type { DonneesAlertes, FaitsFacturation } from "@/pilot/lib/alertes/types";
const d = (s: string) => new Date(s + "T00:00:00Z");
const maintenant = d("2026-11-22");
const faits: FaitsFacturation = { organisationId: 1, premierPocLe: d("2026-11-01"), formationAbsente: false,
  prixARenseigner: false, factureEmiseLe: null, regularisation: false, rattrapage: false, topFacturation: false, premierMoisPayantLe: null };
function donnees(f: Partial<FaitsFacturation> = {}, etape: "EN_POC" | "SIGNE" | "POC_NON_TRANSFORME" = "EN_POC"): DonneesAlertes {
  return { organisations: [{ id: 1, raisonSocialeNom: "Dossier", etape, etapeDepuisLe: maintenant, creeLe: maintenant, prochaineActionLe: maintenant,
    reveilLe: null, decisionAttendueLe: null, dernierEchangeLe: maintenant, responsableId: null, chefDeProjetId: null, contratActif: false }],
    facturations: [{ ...faits, ...f }], etapes: [], rattachements: [], datesPromises: [], regressions: [], contrats: [], propositions: [], acquittements: [],
    parDefaut: { id: 42, nom: "Direction", departement: "DIRECTION", designe: true } };
}
const alertes = (f: Partial<FaitsFacturation> = {}, etape?: "EN_POC" | "SIGNE" | "POC_NON_TRANSFORME") => calculerAlertes(donnees(f, etape), maintenant).actives;
describe("Alertes facturation C-95", () => {
  it("facture dès le début, DG, aucun montant ni données tarifaires", () => {
    const a = alertes()[0];
    expect(a.type).toBe("formation-a-facturer");
    expect(a.attribution?.userId).toBe(42);
    expect(a.attribution?.poste).toBe("Direction générale");
    expect(JSON.stringify(a)).not.toMatch(/centimes|€|750/);
  });
  it("facture émise ferme l'alerte", () => expect(alertes({ factureEmiseLe: maintenant })).toEqual([]));
  it("futur ne réclame pas de facture", () => expect(alertes({ premierPocLe: d("2026-12-01") })).toEqual([]));
  it("non transformé doit aussi sa facture", () => expect(alertes({}, "POC_NON_TRANSFORME")[0].type).toBe("formation-a-facturer"));
  it("prix inconnu est une action distincte de la facture", () => {
    expect(alertes({ prixARenseigner: true }).map((a) => a.type)).toEqual(["formation-a-facturer", "formation-prix-manquant"]);
  });
  it("top sans contrat : le manque est porté par contrat à saisir seul", () => {
    const a = alertes({ topFacturation: true, premierMoisPayantLe: maintenant }, "SIGNE");
    expect(a.filter((a) => a.type === "contrat-a-saisir")).toHaveLength(1);
    expect(a.some((a) => a.type === "top-facturation-incoherent")).toBe(false);
  });
  it("top avec contrat mais formation absente reste incohérent", () => {
    const e = donnees({ topFacturation: true, formationAbsente: true }); e.organisations[0].contratActif = true;
    const a = calculerAlertes(e, maintenant).actives.find((a) => a.type === "top-facturation-incoherent");
    expect(a?.detail).toContain("formation due");
    expect(a?.detail).not.toContain("Activez");
  });
  it("formation absente et contrat manquant : chaque cause garde son action", () => {
    const a = alertes({ topFacturation: true, formationAbsente: true, premierMoisPayantLe: maintenant }, "SIGNE");
    expect(a.filter((a) => a.type === "contrat-a-saisir")).toHaveLength(1);
    expect(a.find((a) => a.type === "top-facturation-incoherent")?.detail).not.toContain("contrat");
  });
  it("prix connu non comptabilisé, clé absente : annonce le prochain arrêté au mois dû", () => {
    const a = alertes({ premierPocLe: d("2026-10-01"), rattrapage: true }).find((a) => a.type === "formation-regularisation");
    expect(a?.titre).toBe("Formation à ajouter au réel");
    expect(a?.detail).toContain("sera ajoutée au réel d'octobre 2026 au prochain arrêté mensuel");
    expect(a?.detail).not.toMatch(/centimes|€|régularisation/);
  });
  it("clé arrêtée appelle une régularisation humaine", () => expect(alertes({ regularisation: true }).some((a) => a.type === "formation-regularisation")).toBe(true));
  it("début officiel fiable, grâce supprimée dès le mois attendu", () => {
    expect(alertes({ premierMoisPayantLe: d("2026-11-30") }, "SIGNE").filter((a) => a.type === "contrat-a-saisir")).toHaveLength(1);
  });
  it("pas d'alerte anticipée si le mois attendu est futur", () => {
    expect(alertes({ premierMoisPayantLe: d("2026-12-01") }, "SIGNE").some((a) => a.type === "contrat-a-saisir")).toBe(false);
  });
  it("sans date fiable garde la grâce C-92", () => expect(alertes({}, "SIGNE").some((a) => a.type === "contrat-a-saisir")).toBe(false));
});

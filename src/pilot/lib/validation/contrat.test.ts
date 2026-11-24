import { describe, expect, it } from "vitest";
import { creationContrat, modificationContrat, ligneContrat, modificationLigneContrat } from "./contrat";
import { messageValidation } from "./messages";
const ligne = { productId: 1, type: "ABONNEMENT", montantCentimes: 12000 };
describe("contrats et lignes", () => {
  it("autorise un brouillon vide et les bornes", () => {
    expect(creationContrat.safeParse({ organisationId: 1, lignes: [], engagementMois: 0, preavisMois: 120 }).success).toBe(true);
    expect(ligneContrat.safeParse({ ...ligne, montantCentimes: 100000000 }).success).toBe(true);
    expect(ligneContrat.safeParse({ ...ligne, montantCentimes: 0 }).success).toBe(true);
    expect(modificationLigneContrat.safeParse({ montantCentimes: 5 }).success).toBe(true);
  });
  it.each([-1, 1.2, 100000001, "12", NaN, Infinity])("refuse le montant %s", (montantCentimes) => {
    const resultat = ligneContrat.safeParse({ ...ligne, montantCentimes });
    expect(resultat.success).toBe(false);
    if (!resultat.success) expect(messageValidation(resultat.error)).toContain("Montant en euros");
  });
  it.each(["ABONNEMENT", "MISE_EN_SERVICE"])("réserve unité et volume à la part variable : %s", (type) => {
    expect(ligneContrat.safeParse({ ...ligne, type, unite: "APPEL_TRAITE" }).success).toBe(false);
    expect(ligneContrat.safeParse({ ...ligne, type, volumeInclus: 0 }).success).toBe(false);
  });
  it("exige une unité variable et borne le volume", () => {
    const variable = { ...ligne, type: "PART_VARIABLE" };
    expect(ligneContrat.safeParse(variable).success).toBe(false);
    expect(ligneContrat.safeParse({ ...variable, unite: "RDV_PRIS", volumeInclus: 0 }).success).toBe(true);
    for (const volumeInclus of [-1, 1.2, 2147483648]) expect(ligneContrat.safeParse({ ...variable, unite: "APPEL_TRAITE", volumeInclus }).success).toBe(false);
  });
  it("exige un libellé sans produit, à la création comme à la modification revalidée (lot S)", () => {
    expect(ligneContrat.safeParse({ ...ligne, productId: null, libelle: "Connecteur RIS" }).success).toBe(true);
    expect(ligneContrat.safeParse({ ...ligne, productId: null }).success).toBe(false);
    expect(ligneContrat.safeParse({ ...ligne, productId: null, libelle: " " }).success).toBe(false);
    expect(creationContrat.safeParse({ organisationId: 1, lignes: [{ type: "PRESTATION", montantCentimes: 50000, libelle: "Vente du connecteur RIS" }] }).success).toBe(true);
    // La route PATCH valide le partiel, puis le service revalide la ligne entière.
    expect(modificationLigneContrat.safeParse({ productId: null }).success).toBe(true);
    expect(ligneContrat.safeParse({ ...ligne, libelle: null, productId: null }).success).toBe(false);
  });
  it("une ligne de contrat offerte est à 0 : le contrat porte le net, une ligne chiffrée serait comptée dans le chiffre d'affaires (lot S, C-39)", () => {
    expect(ligneContrat.safeParse({ ...ligne, montantCentimes: 0, offerte: true, libelle: "Salle offerte" }).success).toBe(true);
    const r = ligneContrat.safeParse({ ...ligne, montantCentimes: 4062, offerte: true });
    expect(r.success).toBe(false);
    if (!r.success) expect(messageValidation(r.error)).toBe("Vérifiez le champ « Montant en euros ».");
    expect(ligneContrat.safeParse({ ...ligne, montantCentimes: 4062, offerte: false }).success).toBe(true);
    expect(creationContrat.safeParse({ organisationId: 1, lignes: [{ ...ligne, montantCentimes: 500, offerte: true }] }).success).toBe(false);
  });
  it("une modification partielle accepte offerte, la ligne entière est revalidée par le service", () => {
    expect(modificationLigneContrat.safeParse({ offerte: true }).success).toBe(true);
    expect(modificationLigneContrat.safeParse({ offerte: true, montantCentimes: 0 }).success).toBe(true);
    expect(modificationLigneContrat.safeParse({ offerte: "oui" }).success).toBe(false);
    expect(ligneContrat.safeParse({ ...ligne, offerte: true }).success).toBe(false);
  });
  it.each([-1, 121, 1.5])("borne les durées %s", (n) => {
    for (const champ of ["engagementMois", "preavisMois"]) expect(modificationContrat.safeParse({ operation: "modifier", [champ]: n }).success).toBe(false);
  });
  it("accepte l'essai, la reconduction et les conditions particulières (C-62)", () => {
    const r = modificationContrat.safeParse({ operation: "modifier", essaiDebuteLe: "2026-11-03", essaiJours: 30, reconduction: "TACITE", conditionsTarifaires: "  " });
    expect(r.success && r.data.operation === "modifier" && r.data.conditionsTarifaires).toBeNull();
    expect(modificationContrat.safeParse({ operation: "modifier", essaiJours: null, reconduction: null, essaiDebuteLe: null }).success).toBe(true);
  });
  it.each([0, 366, 1.5])("borne la durée de l'essai %s", (essaiJours) => {
    const r = modificationContrat.safeParse({ operation: "modifier", essaiJours });
    expect(r.success).toBe(false);
    if (!r.success) expect(messageValidation(r.error)).toContain("Durée de l'essai");
  });
  it("refuse une reconduction inconnue et des conditions trop longues", () => {
    expect(modificationContrat.safeParse({ operation: "modifier", reconduction: "AUTOMATIQUE" }).success).toBe(false);
    expect(modificationContrat.safeParse({ operation: "modifier", conditionsTarifaires: "x".repeat(2001) }).success).toBe(false);
  });
  it("refuse les identifiants, dates et champs inconnus", () => {
    expect(ligneContrat.safeParse({ ...ligne, productId: 1.5 }).success).toBe(false);
    expect(ligneContrat.safeParse({ ...ligne, centreId: -1 }).success).toBe(false);
    expect(modificationContrat.safeParse({ operation: "modifier", signeLe: "invalide" }).success).toBe(false);
    expect(modificationContrat.safeParse({ operation: "modifier", termineLe: "2026-01-01" }).success).toBe(false);
    expect(modificationContrat.safeParse({ operation: "statut", vers: "ACTIF" }).success).toBe(true);
    expect(modificationContrat.safeParse({ operation: "statut", vers: "INCONNU" }).success).toBe(false);
  });
});

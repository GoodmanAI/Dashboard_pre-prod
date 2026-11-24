import { describe, expect, it } from "vitest";
import { CONSEIL_OFFERTE_SANS_PRIX, conseilLigne, ligneCatalogue, ligneDepuisSaisie, ligneHorsGrille, refusLigne, saisieDepuisLigne, type LigneSaisie } from "./saisie";

const base: LigneSaisie = { productId: 1, centreId: "", type: "ABONNEMENT", montant: "270,83", unite: "APPEL_TRAITE", volume: "", libelle: "", offerte: false, quantite: "", prixUnitaire: "", base: "", remise: "" };

describe("ligneDepuisSaisie : ce que le serveur reçoit", () => {
  it("convertit le montant en centimes entiers, sans flottant", () => {
    expect(ligneDepuisSaisie(base).montantCentimes).toBe(27083);
    expect(ligneDepuisSaisie({ ...base, montant: "1 200,5" }).montantCentimes).toBe(120050);
    expect(ligneDepuisSaisie({ ...base, montant: "0,29" }).montantCentimes).toBe(29);
  });
  it("une ligne hors catalogue part sans produit, avec son libellé nettoyé", () => {
    expect(ligneDepuisSaisie({ ...base, productId: "", type: "PRESTATION", libelle: "  Vente de RIS " }))
      .toEqual({ productId: null, centreId: null, type: "PRESTATION", montantCentimes: 27083, unite: null, volumeInclus: null, libelle: "Vente de RIS", offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null, remisePourMille: null });
  });
  it("l'unité et le volume ne partent que pour une part à l'usage", () => {
    expect(ligneDepuisSaisie({ ...base, unite: "SMS_ENVOYE", volume: "200" })).toMatchObject({ unite: null, volumeInclus: null });
    expect(ligneDepuisSaisie({ ...base, type: "PART_VARIABLE", unite: "SMS_ENVOYE", volume: "200" })).toMatchObject({ unite: "SMS_ENVOYE", volumeInclus: 200 });
    expect(ligneDepuisSaisie({ ...base, type: "PART_VARIABLE", volume: "" })).toMatchObject({ volumeInclus: null });
  });
  it("une ligne offerte garde son brut et porte l'indicateur", () => {
    expect(ligneDepuisSaisie({ ...base, offerte: true })).toMatchObject({ montantCentimes: 27083, offerte: true });
  });
  it("un montant illisible lève : le dialogue demande de compléter la saisie", () => {
    expect(() => ligneDepuisSaisie({ ...base, montant: "" })).toThrow();
    expect(() => ligneDepuisSaisie({ ...base, montant: "12,345" })).toThrow();
  });
});

describe("saisieDepuisLigne : le contraire exact", () => {
  it("une ligne relue puis renvoyée ne change pas", () => {
    const lue = { productId: null, centreId: 7, type: "PART_VARIABLE" as const, montantCentimes: 35, unite: "APPEL_TRAITE" as const, volumeInclus: 200, libelle: "Appels", offerte: true };
    expect(ligneDepuisSaisie(saisieDepuisLigne(lue))).toEqual({ ...lue, quantite: null, prixUnitaireCentimes: null, baseQuantite: null, remisePourMille: null });
  });
  it("une ligne ancienne sans indicateur n'est pas offerte", () => {
    expect(saisieDepuisLigne({ productId: 1, centreId: null, type: "ABONNEMENT", montantCentimes: 100, unite: null, volumeInclus: null, libelle: null }).offerte).toBe(false);
  });
});

describe("lignes neuves", () => {
  it("une ligne du catalogue part de l'abonnement, sans montant", () => {
    expect(ligneCatalogue(3)).toMatchObject({ productId: 3, type: "ABONNEMENT", montant: "", offerte: false });
  });
  it("une ligne hors grille est une prestation sans produit", () => {
    expect(ligneHorsGrille()).toMatchObject({ productId: "", type: "PRESTATION", montant: "", libelle: "" });
  });
});

describe("refusLigne : les règles du serveur, dites avant l'envoi", () => {
  it("sans produit, un libellé est obligatoire", () => {
    expect(refusLigne({ ...base, productId: "" })).toBe("Donnez un libellé à une ligne hors catalogue.");
    expect(refusLigne({ ...base, productId: "", libelle: "Vente de RIS" })).toBeNull();
  });
  it("une ligne offerte peut valoir 0 : un geste sans valeur affichée n'est pas refusé", () => {
    expect(refusLigne({ ...base, offerte: true, montant: "0" })).toBeNull();
    expect(refusLigne({ ...base, offerte: true, montant: "0,00" })).toBeNull();
    expect(refusLigne({ ...base, offerte: true })).toBeNull();
  });
  it("un montant encore vide n'est pas refusé ici : le calcul des totaux attend la saisie", () => {
    expect(refusLigne({ ...base, offerte: true, montant: "" })).toBeNull();
  });
});

describe("conseilLigne : l'invitation à indiquer le prix d'un geste, jamais un refus", () => {
  it("une ligne offerte à 0 invite à indiquer son prix", () => {
    expect(conseilLigne({ ...base, offerte: true, montant: "0" })).toBe(CONSEIL_OFFERTE_SANS_PRIX);
    expect(CONSEIL_OFFERTE_SANS_PRIX).toMatch(/indiquez son prix pour montrer ce que vous offrez/);
  });
  it("rien à dire d'une ligne offerte chiffrée, d'une ligne non offerte, ni d'un montant pas encore lisible", () => {
    expect(conseilLigne({ ...base, offerte: true, montant: "250" })).toBeNull();
    expect(conseilLigne({ ...base, offerte: false, montant: "0" })).toBeNull();
    expect(conseilLigne({ ...base, offerte: true, montant: "" })).toBeNull();
    expect(conseilLigne({ ...base, offerte: true, montant: "abc" })).toBeNull();
  });
});

describe("quantité × prix unitaire, remise de la ligne (C-90)", () => {
  it("une ligne calculée envoie son calcul, et le montant en découle", () => {
    expect(ligneDepuisSaisie({ ...base, montant: "", quantite: "3", prixUnitaire: "290", base: "PAR_SALLE", remise: "10" }))
      .toMatchObject({ montantCentimes: 87000, quantite: 3, prixUnitaireCentimes: 29000, baseQuantite: "PAR_SALLE", remisePourMille: 100 });
  });
  it("une remise vide : la ligne suit celle de la version", () => expect(ligneDepuisSaisie(base).remisePourMille).toBeNull());
  it("une quantité sans prix, ou un prix sans quantité, ne part pas", () => {
    expect(() => ligneDepuisSaisie({ ...base, quantite: "3" })).toThrow();
    expect(() => ligneDepuisSaisie({ ...base, prixUnitaire: "290" })).toThrow();
    expect(() => ligneDepuisSaisie({ ...base, quantite: "2,5", prixUnitaire: "290" })).toThrow();
  });
  it("la part variable ignore la quantité : elle a déjà un prix unitaire", () => {
    expect(ligneDepuisSaisie({ ...base, type: "PART_VARIABLE", montant: "0,50", quantite: "3", prixUnitaire: "1" })).toMatchObject({ montantCentimes: 50, quantite: null });
  });
  it("aller-retour : une ligne lue se ressaisit à l'identique", () => {
    const lue = { productId: 1, centreId: null, type: "ABONNEMENT" as const, montantCentimes: 87000, unite: null, volumeInclus: null, libelle: null,
      offerte: false, quantite: 3, prixUnitaireCentimes: 29000, baseQuantite: "PAR_SALLE" as const, remisePourMille: 125 };
    expect(ligneDepuisSaisie(saisieDepuisLigne(lue))).toEqual({ ...lue, montantCentimes: 87000 });
  });
});

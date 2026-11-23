import { describe, expect, it } from "vitest";
import { eurosPrecis } from "@/pilot/lib/argent";
import { dateCle, debutApresEssai, decrireTarif, detailCalcul, essaiContrat, manquesVente, produitsDuClient, type LigneVente } from "./regles";

const d = (iso: string) => new Date(iso);
const maintenant = d("2026-11-06T15:00:00Z");

describe("formation et interfaçage : le journal d'abord, la check-list ensuite", () => {
  const planifie = (iso: string) => ({ statut: "PLANIFIE" as const, surveneuLe: d(iso) });
  const realise = (iso: string) => ({ statut: "REALISE" as const, surveneuLe: d(iso) });

  it("le prochain rendez-vous à venir l'emporte, même sur une réunion déjà faite", () => {
    expect(dateCle([realise("2026-10-01"), planifie("2026-12-01"), planifie("2026-11-20")], [d("2026-09-01")], maintenant))
      .toEqual({ etat: "prevue", le: d("2026-11-20"), source: "journal" });
  });
  it("un rendez-vous du jour est encore à venir", () => {
    expect(dateCle([planifie("2026-11-06T00:00:00Z")], [], maintenant).etat).toBe("prevue");
  });
  it("sinon la dernière réunion faite", () => {
    expect(dateCle([realise("2026-09-01"), realise("2026-10-01")], [], maintenant)).toEqual({ etat: "faite", le: d("2026-10-01"), source: "journal" });
  });
  it("un rendez-vous passé resté planifié est à confirmer", () => {
    expect(dateCle([planifie("2026-10-01"), planifie("2026-11-01")], [d("2026-08-01")], maintenant))
      .toEqual({ etat: "a_confirmer", le: d("2026-11-01"), source: "journal" });
  });
  it("sans réunion au journal, la dernière case cochée", () => {
    expect(dateCle([], [d("2026-03-01"), d("2026-04-01")], maintenant)).toEqual({ etat: "faite", le: d("2026-04-01"), source: "checklist" });
  });
  it("rien : l'écran dit comment planifier", () => {
    expect(dateCle([], [], maintenant)).toEqual({ etat: "aucune", le: null, source: null });
  });
});

describe("essai", () => {
  it("absent quand rien n'est saisi", () => expect(essaiContrat({ essaiDebuteLe: null, essaiJours: null }, maintenant)).toBeNull());
  it("30 jours à partir du 3 finissent le 2 du mois suivant, jour compris", () => {
    expect(essaiContrat({ essaiDebuteLe: d("2026-11-03"), essaiJours: 30 }, maintenant))
      .toEqual({ jours: 30, debut: d("2026-11-03"), fin: d("2026-12-02"), etat: "en_cours", joursRestants: 27 });
  });
  it("le dernier jour reste en cours, avec un jour restant", () => {
    expect(essaiContrat({ essaiDebuteLe: d("2026-11-01"), essaiJours: 6 }, maintenant)).toMatchObject({ etat: "en_cours", joursRestants: 1 });
  });
  it("à venir, puis terminé", () => {
    expect(essaiContrat({ essaiDebuteLe: d("2026-11-07"), essaiJours: 14 }, maintenant)?.etat).toBe("a_venir");
    expect(essaiContrat({ essaiDebuteLe: d("2026-10-01"), essaiJours: 30 }, maintenant)).toMatchObject({ etat: "termine", fin: d("2026-10-30") });
  });
  it("incomplet sans début ou sans durée", () => {
    expect(essaiContrat({ essaiDebuteLe: null, essaiJours: 30 }, maintenant)).toMatchObject({ etat: "incomplet", jours: 30, fin: null });
    expect(essaiContrat({ essaiDebuteLe: d("2026-11-03"), essaiJours: null }, maintenant)).toMatchObject({ etat: "incomplet", debut: d("2026-11-03") });
  });
});

describe("produits du client", () => {
  const ligne = (champs: Partial<LigneVente>): LigneVente => ({ productId: 1, produit: "LyraeTalk", centre: null, type: "ABONNEMENT",
    montantCentimes: 90000, unite: null, volumeInclus: null, libelle: null, ...champs });

  it("chaque produit garde ses dates et son abonnement", () => {
    const produits = produitsDuClient([
      { productId: 1, produit: "LyraeTalk", miseEnProductionLe: d("2026-03-10"), datePromise: null },
      { productId: 1, produit: "LyraeTalk", miseEnProductionLe: d("2026-02-01"), datePromise: null },
      { productId: 4, produit: "NoShow", miseEnProductionLe: null, datePromise: d("2026-12-15") },
    ], [ligne({}), ligne({ montantCentimes: 10000 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 250000 }), ligne({ productId: 4, produit: "NoShow", montantCentimes: 20000 })]);
    expect(produits).toEqual([
      { productId: 1, nom: "LyraeTalk", centres: 2, centresEnService: 2, depuisLe: d("2026-02-01"), prevuLe: null, mensuelCentimes: 100000, etat: "en_service" },
      { productId: 4, nom: "NoShow", centres: 1, centresEnService: 0, depuisLe: null, prevuLe: d("2026-12-15"), mensuelCentimes: 20000, etat: "prevu" },
    ]);
  });
  it("partiel, à planifier, et vendu sans centre", () => {
    const produits = produitsDuClient([
      { productId: 1, produit: "LyraeTalk", miseEnProductionLe: d("2026-03-10"), datePromise: null },
      { productId: 1, produit: "LyraeTalk", miseEnProductionLe: null, datePromise: d("2026-12-01") },
      { productId: 2, produit: "Konnect", miseEnProductionLe: null, datePromise: null },
    ], [ligne({ productId: 3, produit: "Desk" })]);
    expect(produits.map((p) => [p.nom, p.etat])).toEqual([["Desk", "sans_centre"], ["Konnect", "a_planifier"], ["LyraeTalk", "partiel"]]);
    expect(produits.find((p) => p.nom === "LyraeTalk")).toMatchObject({ centresEnService: 1, prevuLe: d("2026-12-01") });
  });
  it("une prestation et une ligne offerte (lot S) ne changent pas l'abonnement du produit", () => {
    const produits = produitsDuClient([], [ligne({}), ligne({ type: "PRESTATION", montantCentimes: 150000 }),
      ligne({ montantCentimes: 0, offerte: true, libelle: "Salle offerte" }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 0, offerte: true })]);
    expect(produits).toEqual([{ productId: 1, nom: "LyraeTalk", centres: 0, centresEnService: 0, depuisLe: null, prevuLe: null, mensuelCentimes: 90000, etat: "sans_centre" }]);
  });
  it("une ligne sans produit (lot S) ne crée pas de produit", () => {
    const produits = produitsDuClient([], [ligne({}), ligne({ productId: null, produit: "Connecteur RIS", montantCentimes: 5000 })]);
    expect(produits).toEqual([{ productId: 1, nom: "LyraeTalk", centres: 0, centresEnService: 0, depuisLe: null, prevuLe: null, mensuelCentimes: 90000, etat: "sans_centre" }]);
  });
});

describe("tarifs lisibles", () => {
  // Intl sépare milliers et symbole par des espaces insécables : on compare le texte lu.
  const lu = (t: { libelle: string; montant: string }) => ({ ...t, montant: t.montant.replace(/[  ]/g, " ") });
  it("abonnement, frais d'installation, part à l'usage", () => {
    expect(lu(decrireTarif({ type: "ABONNEMENT", montantCentimes: 90000, unite: null, volumeInclus: null, libelle: null })))
      .toEqual({ libelle: "Abonnement", montant: "900,00 € par mois" });
    expect(lu(decrireTarif({ type: "MISE_EN_SERVICE", montantCentimes: 250000, unite: null, volumeInclus: null, libelle: "Mise en service" })))
      .toEqual({ libelle: "Mise en service", montant: "2 500,00 €, une fois" });
    expect(lu(decrireTarif({ type: "PART_VARIABLE", montantCentimes: 35, unite: "APPEL_TRAITE", volumeInclus: 200, libelle: null })))
      .toEqual({ libelle: "Part à l'usage", montant: "0,35 € par appel traité au-delà de 200" });
  });
  it("une prestation se facture une fois", () => {
    expect(lu(decrireTarif({ type: "PRESTATION", montantCentimes: 50000, unite: null, volumeInclus: null, libelle: null })))
      .toEqual({ libelle: "Prestation", montant: "500,00 €, une fois" });
  });
});

describe("tarifs lisibles, gestes commerciaux (lot S)", () => {
  const lu = (t: { libelle: string; montant: string }) => ({ ...t, montant: t.montant.replace(/[  ]/g, " ") });
  const base = { unite: null, volumeInclus: null, libelle: null };
  it("une ligne offerte se lit « offert », avec sa périodicité", () => {
    expect(lu(decrireTarif({ ...base, type: "MISE_EN_SERVICE", montantCentimes: 0, offerte: true, libelle: "Installation et formation Talk" })))
      .toEqual({ libelle: "Installation et formation Talk", montant: "Offert, une fois" });
    expect(lu(decrireTarif({ ...base, type: "PRESTATION", montantCentimes: 0, offerte: true }))).toEqual({ libelle: "Prestation", montant: "Offert, une fois" });
    expect(lu(decrireTarif({ ...base, type: "ABONNEMENT", montantCentimes: 0, offerte: true }))).toEqual({ libelle: "Abonnement", montant: "Offert chaque mois" });
    expect(lu(decrireTarif({ ...base, type: "PART_VARIABLE", montantCentimes: 0, unite: "APPEL_TRAITE", offerte: true }))).toEqual({ libelle: "Part à l'usage", montant: "Offert" });
  });
  it("une ligne offerte qui garde un montant dit ce qu'il vaut", () => {
    expect(lu(decrireTarif({ ...base, type: "MISE_EN_SERVICE", montantCentimes: 62500, offerte: true })))
      .toEqual({ libelle: "Frais d'installation", montant: "Offert (625,00 €), une fois" });
  });
  it("une part à l'usage offerte qui garde un prix dit encore son unité", () => {
    expect(lu(decrireTarif({ ...base, type: "PART_VARIABLE", montantCentimes: 35, unite: "APPEL_TRAITE", volumeInclus: 200, offerte: true })))
      .toEqual({ libelle: "Part à l'usage", montant: "Offert (0,35 € par appel traité au-delà de 200)" });
    expect(lu(decrireTarif({ ...base, type: "PART_VARIABLE", montantCentimes: 8, unite: "SMS_ENVOYE", offerte: true })))
      .toEqual({ libelle: "Part à l'usage", montant: "Offert (0,08 € par SMS envoyé)" });
  });
  it("sans l'indicateur, rien ne change", () => {
    expect(lu(decrireTarif({ ...base, type: "PRESTATION", montantCentimes: 50000, offerte: false }))).toEqual({ libelle: "Prestation", montant: "500,00 €, une fois" });
    expect(lu(decrireTarif({ ...base, type: "ABONNEMENT", montantCentimes: 0 }))).toEqual({ libelle: "Abonnement", montant: "0,00 € par mois" });
  });
});

describe("ce qui manque", () => {
  const complet = { statut: "ACTIF" as const, debuteLe: d("2026-01-01"), engagementMois: 24, reconduction: "TACITE" as const, lignes: [1] };
  it("rien pour un contrat actif complet, l'essai n'étant pas obligatoire", () => expect(manquesVente([complet])).toEqual([]));
  it("le contrat lui-même quand il n'y en a pas", () => expect(manquesVente([])).toEqual(["le contrat"]));
  it("chaque manque une fois, dans l'ordre de lecture", () => {
    expect(manquesVente([{ statut: "BROUILLON", debuteLe: null, engagementMois: null, reconduction: null, lignes: [] }, { ...complet, debuteLe: null }]))
      .toEqual(["l'activation du contrat", "le début officiel", "la durée", "la reconduction", "les tarifs"]);
  });
});

describe("début officiel après l'essai (C-87)", () => {
  it("le lendemain du dernier jour d'essai", () => expect(debutApresEssai("2026-11-03", 30)).toBe("2026-12-03"));
  it("un essai d'un jour", () => expect(debutApresEssai("2026-12-31", 1)).toBe("2027-01-01"));
  it("traverse un mois de février", () => expect(debutApresEssai("2028-02-15", 15)).toBe("2028-03-01"));
  it("rien si l'essai est incomplet ou hors bornes", () => {
    expect(debutApresEssai("", 30)).toBeNull();
    expect(debutApresEssai("2026-11-03", null)).toBeNull();
    expect(debutApresEssai("2026-11-03", 0)).toBeNull();
    expect(debutApresEssai("2026-11-03", 366)).toBeNull();
    expect(debutApresEssai("2026-11-03", 2.5)).toBeNull();
  });
});

describe("le calcul d'une ligne, en clair (C-90)", () => {
  it("salles, sites, remise", () => {
    expect(detailCalcul({ quantite: 3, prixUnitaireCentimes: 29000, baseQuantite: "PAR_SALLE", remisePourMille: 100 })).toBe(`3 salles × ${eurosPrecis(29000)} − 10 %`);
    expect(detailCalcul({ quantite: 1, prixUnitaireCentimes: 50000, baseQuantite: "PAR_SITE" })).toBe(`1 site × ${eurosPrecis(50000)}`);
    expect(detailCalcul({ quantite: 2, prixUnitaireCentimes: 100, remisePourMille: 125 })).toBe(`2 × ${eurosPrecis(100)} − 12,5 %`);
    expect(detailCalcul({ quantite: null, prixUnitaireCentimes: 100 })).toBeNull();
  });
  it("le tarif d'une ligne de contrat dit son calcul", () => {
    expect(decrireTarif({ type: "ABONNEMENT", montantCentimes: 78300, unite: null, volumeInclus: null, libelle: "Talk", offerte: false,
      quantite: 3, prixUnitaireCentimes: 29000, baseQuantite: "PAR_SALLE", remisePourMille: 100 }).montant).toBe(`${eurosPrecis(78300)} par mois (3 salles × ${eurosPrecis(29000)} − 10 %)`);
  });
});

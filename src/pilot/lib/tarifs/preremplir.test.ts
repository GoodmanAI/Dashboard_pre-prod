import { describe, expect, it } from "vitest";
import { GRILLE_EN_BASE } from "@/pilot/lib/apports/grilleEssai";
import { recurrentDesSalles } from "@/pilot/lib/apports/calcul";
import { estimerMontant } from "./estimer";
import { GRILLE_VIDE, grilleDepuisTarifs, type GrilleEnVigueur, type TarifGrille } from "./grille";
import { combinerOffres, expliquerRemarque, preremplir, repartirSalles, type CentrePreremplissage, type OffresPreremplissage } from "./preremplir";

const aucune: OffresPreremplissage = { offreTalk: false, offreKonnect: false, offreConnecteurRis: false };
const centre = (id: number, salles: number, offres: Partial<OffresPreremplissage> = {}): CentrePreremplissage => ({ id, salles, ...aucune, ...offres });
/** La grille de base avec des tarifs remplacés (même code) ou retirés (null). */
function grilleAvec(changes: Record<string, Partial<TarifGrille> | null>): GrilleEnVigueur {
  const tarifs = GRILLE_EN_BASE.tarifs.flatMap((t) => changes[t.code] === null ? [] : [{ ...t, ...changes[t.code] }]);
  return grilleDepuisTarifs({ id: 9, applicableLe: new Date("2026-11-18T00:00:00Z") }, tarifs);
}
const resume = (r: ReturnType<typeof preremplir>) => r.lignes.map((l) => [l.code, l.centreId, l.montantCentimes, l.prixARenseigner]);

describe("répartir le nombre de salles de l'organisation", () => {
  it("les salles saisies une par une l'emportent", () => {
    expect(repartirSalles([2, 0], 10)).toEqual({ salles: [2, 0], reparties: false });
  });
  it("sinon le nombre de salles, en entiers, le reste sur le premier centre", () => {
    expect(repartirSalles([0, 0, 0], 7)).toEqual({ salles: [3, 2, 2], reparties: true });
    expect(repartirSalles([0, 0, 0], 2)).toEqual({ salles: [2, 0, 0], reparties: true });
    expect(repartirSalles([0, 0], 6)).toEqual({ salles: [3, 3], reparties: true });
  });
  it("sans nombre de salles, rien à répartir", () => {
    expect(repartirSalles([0, 0], null)).toEqual({ salles: [0, 0], reparties: false });
    expect(repartirSalles([0], 0)).toEqual({ salles: [0], reparties: false });
    expect(repartirSalles([], 5)).toEqual({ salles: [], reparties: false });
  });
});

describe("combiner les offres, en OU logique (C-63)", () => {
  it("une offre cochée quelque part est retenue", () => {
    expect(combinerOffres({ ...aucune, offreKonnect: true }, null, { ...aucune, offreConnecteurRis: true }, undefined))
      .toEqual({ offreTalk: false, offreKonnect: true, offreConnecteurRis: true });
    expect(combinerOffres()).toEqual(aucune);
  });
});

describe("preremplir : les lignes d'une proposition depuis la grille", () => {
  it("un centre, Talk et connecteur : salles × prix, connecteur par la règle de l'apport, installation par site", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(7, 3, { offreTalk: true, offreConnecteurRis: true })], aucune);
    const connecteur = recurrentDesSalles(3, { talk: true, konnect: false, ris: true }, { talkCentimes: 27083, konnectCentimes: 7917, connecteurRisPdm: 1500 }).connecteur;
    expect(r.lignes).toEqual([
      { code: "TALK", productId: 1, libelle: "Talk", type: "ABONNEMENT", montantCentimes: 81249, centreId: 7, prixARenseigner: false, offerte: false, quantite: 3, prixUnitaireCentimes: 27083, baseQuantite: "PAR_SALLE" },
      { code: "CONNECTEUR_RIS", productId: null, libelle: "Connecteur RIS", type: "ABONNEMENT", montantCentimes: connecteur, centreId: 7, prixARenseigner: false, offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null },
      { code: "INSTALLATION_TALK", productId: 1, libelle: "Installation et formation Talk", type: "MISE_EN_SERVICE", montantCentimes: 62500, centreId: 7, prixARenseigner: false, offerte: false, quantite: 1, prixUnitaireCentimes: 62500, baseQuantite: "PAR_SITE" },
    ]);
    expect(connecteur).toBe(12187);
    expect(r.remarques).toEqual([]);
    // Le mensuel prérempli est celui de l'estimation du prospect, au centime.
    const mensuelPrerempli = r.lignes.filter((l) => l.type === "ABONNEMENT").reduce((somme, l) => somme + l.montantCentimes, 0);
    const estime = estimerMontant(3, { talk: true, konnect: false, connecteurRis: true }, GRILLE_EN_BASE);
    expect(estime).toMatchObject({ complet: true, mensuelCentimes: mensuelPrerempli });
  });
  it("les offres du groupe et celles du centre se combinent en OU", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 2, { offreTalk: true }), centre(2, 1)], { ...aucune, offreKonnect: true });
    expect(resume(r)).toEqual([
      ["TALK", 1, 54166, false], ["KONNECT", 1, 15834, false], ["INSTALLATION_TALK", 1, 62500, false], ["INSTALLATION_KONNECT", 1, 37500, false],
      ["KONNECT", 2, 7917, false], ["INSTALLATION_KONNECT", 2, 37500, false],
    ]);
  });
  it("aucun centre : aucune ligne, et l'écran dit pourquoi", () => {
    const r = preremplir(GRILLE_EN_BASE, [], { ...aucune, offreTalk: true }, { nombreSalles: 4 });
    expect(r).toEqual({ lignes: [], remarques: [{ code: "AUCUN_CENTRE", centreId: null, tarif: null }] });
    expect(expliquerRemarque(r.remarques[0])).toMatch(/centre/);
  });
  it("les équipements déclarés ne se facturent pas : chaque centre reste sans salle, et la remarque le dit", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 0, { offreTalk: true }), centre(2, 0, { offreTalk: true })], aucune, { nombreIrm: 3, nombreScanners: 3 });
    expect(r.lignes).toEqual([]);
    expect(r.remarques).toEqual([{ code: "CENTRE_SANS_SALLE", centreId: 1, tarif: null }, { code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null }]);
    expect(expliquerRemarque(r.remarques[0], { nomCentre: "Site principal" })).toBe("Le centre Site principal n'a aucune salle. Ajoutez ses salles pour chiffrer ses lignes.");
  });
  it("le même ordre que la température : le nombre de la fiche l'emporte sur les équipements, les salles saisies sur les deux", () => {
    const fiche = preremplir(GRILLE_EN_BASE, [centre(1, 0, { offreTalk: true })], aucune, { nombreSalles: 2, nombreIrm: 9 });
    expect(fiche.lignes.find((l) => l.code === "TALK")?.montantCentimes).toBe(2 * 27083);
    const saisies = preremplir(GRILLE_EN_BASE, [centre(1, 1, { offreTalk: true })], aucune, { nombreSalles: 8, nombreIrm: 9 });
    expect(saisies.lignes.find((l) => l.code === "TALK")?.montantCentimes).toBe(27083);
    expect(saisies.remarques).toEqual([]);
  });
  it("un centre sans salle n'a aucune ligne, les autres sont chiffrés", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 2, { offreTalk: true }), centre(2, 0, { offreTalk: true })], aucune, { nombreSalles: 10 });
    expect(resume(r)).toEqual([["TALK", 1, 54166, false], ["INSTALLATION_TALK", 1, 62500, false]]);
    expect(r.remarques).toEqual([{ code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null }]);
  });
  it("sans salle saisie, le nombre de salles de l'organisation se répartit, le reste sur le premier centre", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 0), centre(2, 0), centre(3, 0)], { ...aucune, offreTalk: true }, { nombreSalles: 7 });
    expect(r.lignes.filter((l) => l.code === "TALK").map((l) => [l.centreId, l.montantCentimes])).toEqual([[1, 3 * 27083], [2, 2 * 27083], [3, 2 * 27083]]);
    expect(r.remarques).toEqual([{ code: "SALLES_REPARTIES", centreId: null, tarif: null }]);
    // Deux salles pour trois centres : les deux sur le premier, les autres sans salle.
    const peu = preremplir(GRILLE_EN_BASE, [centre(1, 0), centre(2, 0), centre(3, 0)], { ...aucune, offreTalk: true }, { nombreSalles: 2 });
    expect(peu.lignes.filter((l) => l.code === "TALK").map((l) => [l.centreId, l.montantCentimes])).toEqual([[1, 54166]]);
    expect(peu.remarques.map((x) => [x.code, x.centreId])).toEqual([["SALLES_REPARTIES", null], ["CENTRE_SANS_SALLE", 2], ["CENTRE_SANS_SALLE", 3]]);
  });
  it("un tarif absent de la grille : pas de ligne, une remarque ; le connecteur qui en dépend reste à renseigner", () => {
    const r = preremplir(grilleAvec({ KONNECT: null }), [centre(1, 2, { offreKonnect: true, offreConnecteurRis: true })], aucune);
    expect(resume(r)).toEqual([["CONNECTEUR_RIS", 1, 0, true], ["INSTALLATION_KONNECT", 1, 37500, false]]);
    expect(r.remarques).toEqual([{ code: "TARIF_ABSENT", centreId: null, tarif: "KONNECT" }]);
    // Une seule remarque par code, même sur plusieurs centres.
    const deux = preremplir(grilleAvec({ INSTALLATION_TALK: null }), [centre(1, 1), centre(2, 1)], { ...aucune, offreTalk: true });
    expect(deux.remarques).toEqual([{ code: "TARIF_ABSENT", centreId: null, tarif: "INSTALLATION_TALK" }]);
    expect(deux.lignes.map((l) => l.code)).toEqual(["TALK", "TALK"]);
  });
  it("un tarif sans prix donne une ligne à 0, marquée « prix à renseigner », jamais un prix inventé", () => {
    const r = preremplir(grilleAvec({ TALK: { montantHtCentimes: null } }), [centre(1, 4, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(r.lignes).toEqual([
      { code: "TALK", productId: 1, libelle: "Talk", type: "ABONNEMENT", montantCentimes: 0, centreId: 1, prixARenseigner: true, offerte: false, quantite: 4, prixUnitaireCentimes: 0, baseQuantite: "PAR_SALLE" },
      { code: "CONNECTEUR_RIS", productId: null, libelle: "Connecteur RIS", type: "ABONNEMENT", montantCentimes: 0, centreId: 1, prixARenseigner: true, offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null },
      { code: "INSTALLATION_TALK", productId: 1, libelle: "Installation et formation Talk", type: "MISE_EN_SERVICE", montantCentimes: 62500, centreId: 1, prixARenseigner: false, offerte: false, quantite: 1, prixUnitaireCentimes: 62500, baseQuantite: "PAR_SITE" },
    ]);
    // Le taux du connecteur absent : la ligne est à renseigner, les salles restent chiffrées.
    const sansTaux = preremplir(grilleAvec({ CONNECTEUR_RIS: { pourMille: null } }), [centre(1, 1, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(resume(sansTaux).slice(0, 2)).toEqual([["TALK", 1, 27083, false], ["CONNECTEUR_RIS", 1, 0, true]]);
  });
  it("le connecteur sans Talk ni Konnect ne fait pas une ligne : il suit les salles", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 3, { offreConnecteurRis: true })], aucune);
    expect(r).toEqual({ lignes: [], remarques: [{ code: "CONNECTEUR_SEUL", centreId: 1, tarif: null }] });
  });
  it("installation par site, par organisation, par salle : la base du tarif décide", () => {
    const centres = [centre(1, 2, { offreTalk: true }), centre(2, 3, { offreTalk: true }), centre(3, 0, { offreTalk: true })];
    const installations = (base: TarifGrille["base"]) => preremplir(grilleAvec({ INSTALLATION_TALK: { base } }), centres, aucune).lignes
      .filter((l) => l.code === "INSTALLATION_TALK").map((l) => [l.centreId, l.montantCentimes]);
    expect(installations("PAR_SITE")).toEqual([[1, 62500], [2, 62500]]);
    expect(installations("PAR_ORGANISATION")).toEqual([[null, 62500]]);
    expect(installations("PAR_SALLE")).toEqual([[1, 2 * 62500], [2, 3 * 62500]]);
    // La ligne d'organisation vient après celles des centres.
    expect(preremplir(grilleAvec({ INSTALLATION_TALK: { base: "PAR_ORGANISATION" } }), centres, aucune).lignes.at(-1)).toMatchObject({ code: "INSTALLATION_TALK", centreId: null });
    // Sans centre équipé, pas d'installation d'organisation.
    expect(preremplir(grilleAvec({ INSTALLATION_TALK: { base: "PAR_ORGANISATION" } }), [centre(3, 0, { offreTalk: true })], aucune).lignes).toEqual([]);
  });
  it("un abonnement d'une autre base suit la même règle, un pourcentage inattendu reste à renseigner", () => {
    const parSite = preremplir(grilleAvec({ TALK: { base: "PAR_SITE", montantHtCentimes: 50000 } }), [centre(1, 4, { offreTalk: true })], aucune);
    expect(resume(parSite)[0]).toEqual(["TALK", 1, 50000, false]);
    const pourcentage = preremplir(grilleAvec({ TALK: { base: "POURCENTAGE", montantHtCentimes: null, pourMille: 100 } }), [centre(1, 4, { offreTalk: true })], aucune);
    expect(resume(pourcentage)[0]).toEqual(["TALK", 1, 0, true]);
  });
  it("aucune grille en vigueur : aucune ligne, et la phrase dit de la créer", () => {
    const r = preremplir(GRILLE_VIDE, [centre(1, 3, { offreTalk: true })], aucune);
    expect(r).toEqual({ lignes: [], remarques: [{ code: "AUCUNE_GRILLE", centreId: null, tarif: null }] });
    expect(expliquerRemarque(r.remarques[0])).toBe("Aucune grille tarifaire en vigueur. Créez-la sur la page Tarifs.");
  });
  it("une grille en vigueur sans tarif n'est pas « aucune grille » : la phrase dit d'ajouter ses tarifs", () => {
    for (const grille of [{ id: 4, tarifs: [] }, { tarifs: [] }]) {
      const r = preremplir(grille, [centre(1, 3, { offreTalk: true })], aucune);
      expect(r).toEqual({ lignes: [], remarques: [{ code: "GRILLE_VIDE", centreId: null, tarif: null }] });
    }
    expect(expliquerRemarque({ code: "GRILLE_VIDE", centreId: null, tarif: null })).toBe("La grille tarifaire en vigueur n'a aucun tarif. Ajoutez ses tarifs sur la page Tarifs.");
  });
  it("les remarques d'un centre le nomment quand on connaît son nom", () => {
    expect(expliquerRemarque({ code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null }, { nomCentre: "Site principal" }))
      .toBe("Le centre Site principal n'a aucune salle. Ajoutez ses salles pour chiffrer ses lignes.");
    expect(expliquerRemarque({ code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null })).toBe("Ce centre n'a aucune salle. Ajoutez ses salles pour chiffrer ses lignes.");
    expect(expliquerRemarque({ code: "CONNECTEUR_SEUL", centreId: 2, tarif: null }, { nomCentre: "Site annexe" }))
      .toBe("Au centre Site annexe, le connecteur RIS suit les salles Talk ou Konnect. Cochez l'une de ces offres pour ce centre.");
  });
  it("une grille figée ne se corrige plus : le conseil vise une nouvelle grille datée", () => {
    expect(expliquerRemarque({ code: "TARIF_ABSENT", centreId: null, tarif: "DESK" }, { grilleFigee: true }))
      .toBe("La grille en vigueur n'a pas de tarif pour l'abonnement Desk. Sur la page Tarifs, ajoutez un tarif de rôle « Abonnement Desk » dans une nouvelle grille datée.");
    expect(expliquerRemarque({ code: "PRODUIT_NON_RELIE", centreId: null, tarif: "TALK" }, { grilleFigee: true })).toMatch(/sur la page Tarifs dans une nouvelle grille datée\.$/);
    expect(expliquerRemarque({ code: "TARIF_ABSENT", centreId: null, tarif: "DESK" }, { grilleFigee: false })).not.toMatch(/nouvelle grille/);
  });
  it("aucune offre cochée : aucune ligne, et l'écran dit quoi cocher", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 3)], aucune);
    expect(r).toEqual({ lignes: [], remarques: [{ code: "AUCUNE_OFFRE", centreId: null, tarif: null }] });
  });
  it("chaque remarque a sa phrase, courte et sans tiret cadratin", () => {
    for (const code of ["AUCUN_CENTRE", "GRILLE_VIDE", "AUCUNE_OFFRE", "SALLES_REPARTIES", "CENTRE_SANS_SALLE", "CONNECTEUR_SEUL", "TARIF_ABSENT", "PRODUIT_NON_RELIE", "CONNECTEUR_HORS_SALLE", "AUCUNE_GRILLE"] as const) {
      for (const contexte of [{}, { nomCentre: "Site principal", grilleFigee: true }]) {
        const phrase = expliquerRemarque({ code, centreId: 1, tarif: "KONNECT" }, contexte);
        expect(phrase.length).toBeGreaterThan(10);
        expect(phrase).not.toMatch(/—/);
      }
    }
  });
  it("tous les montants sont des centimes entiers, aucune ligne n'est offerte", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 5, { offreTalk: true, offreKonnect: true, offreConnecteurRis: true }), centre(2, 1)], { ...aucune, offreConnecteurRis: true }, { nombreSalles: 9 });
    expect(r.lignes.every((l) => Number.isSafeInteger(l.montantCentimes) && l.montantCentimes >= 0 && l.offerte === false)).toBe(true);
    expect(r.remarques).toEqual([{ code: "CONNECTEUR_SEUL", centreId: 2, tarif: null }]);
  });
});

describe("répartir les salles : cas limites", () => {
  it("un seul centre reçoit tout le nombre de salles", () => {
    expect(repartirSalles([0], 5)).toEqual({ salles: [5], reparties: true });
  });
  it("une salle sur trois centres : la salle va au premier", () => {
    expect(repartirSalles([0, 0, 0], 1)).toEqual({ salles: [1, 0, 0], reparties: true });
  });
  it("un nombre non entier ou négatif ne se répartit pas", () => {
    for (const n of [2.5, -3, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(repartirSalles([0, 0], n)).toEqual({ salles: [0, 0], reparties: false });
    }
  });
});

describe("preremplir : prix à zéro, tarifs manquants, ordre (lot S, cas limites)", () => {
  it("un prix à 0 € et un taux à 0 ‰ sont des prix : ni « à renseigner » ni remarque", () => {
    const r = preremplir(grilleAvec({ TALK: { montantHtCentimes: 0 }, CONNECTEUR_RIS: { pourMille: 0 }, INSTALLATION_TALK: { montantHtCentimes: 0 } }),
      [centre(1, 3, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(resume(r)).toEqual([["TALK", 1, 0, false], ["CONNECTEUR_RIS", 1, 0, false], ["INSTALLATION_TALK", 1, 0, false]]);
    expect(r.remarques).toEqual([]);
  });
  it("Talk sans prix avec un centre Konnect seul : le connecteur se chiffre sur Konnect", () => {
    const r = preremplir(grilleAvec({ TALK: { montantHtCentimes: null } }), [centre(1, 2, { offreKonnect: true, offreConnecteurRis: true })], aucune);
    expect(resume(r)).toEqual([["KONNECT", 1, 15834, false], ["CONNECTEUR_RIS", 1, 2375, false], ["INSTALLATION_KONNECT", 1, 37500, false]]);
  });
  it("Talk sans prix avec Talk et Konnect : la ligne Talk et le connecteur restent à renseigner, Konnect est chiffré", () => {
    const r = preremplir(grilleAvec({ TALK: { montantHtCentimes: null } }), [centre(1, 2, { offreTalk: true, offreKonnect: true, offreConnecteurRis: true })], aucune);
    expect(resume(r)).toEqual([["TALK", 1, 0, true], ["KONNECT", 1, 15834, false], ["CONNECTEUR_RIS", 1, 0, true],
      ["INSTALLATION_TALK", 1, 62500, false], ["INSTALLATION_KONNECT", 1, 37500, false]]);
  });
  it("le connecteur est arrondi une seule fois, sur la somme des salles, pas sur chaque produit", () => {
    // 1 salle à 1 centime par produit, 25 % : 2 x 0,25 = 0,5 arrondi à 1 ; chaque produit seul donnerait 0.
    const grille = grilleAvec({ TALK: { montantHtCentimes: 1 }, KONNECT: { montantHtCentimes: 1 }, CONNECTEUR_RIS: { pourMille: 250 } });
    const r = preremplir(grille, [centre(1, 1, { offreTalk: true, offreKonnect: true, offreConnecteurRis: true })], aucune);
    expect(r.lignes.find((l) => l.code === "CONNECTEUR_RIS")?.montantCentimes).toBe(1);
    const talkSeul = preremplir(grille, [centre(1, 1, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(talkSeul.lignes.find((l) => l.code === "CONNECTEUR_RIS")?.montantCentimes).toBe(0);
  });
  it("une installation par organisation sans prix : une ligne unique à renseigner, sans centre", () => {
    const r = preremplir(grilleAvec({ INSTALLATION_TALK: { base: "PAR_ORGANISATION", montantHtCentimes: null } }), [centre(1, 1, { offreTalk: true }), centre(2, 2, { offreTalk: true })], aucune);
    expect(r.lignes.filter((l) => l.code === "INSTALLATION_TALK")).toEqual([
      { code: "INSTALLATION_TALK", productId: 1, libelle: "Installation et formation Talk", type: "MISE_EN_SERVICE", montantCentimes: 0, centreId: null, prixARenseigner: true, offerte: false, quantite: 1, prixUnitaireCentimes: 0, baseQuantite: "PAR_ORGANISATION" },
    ]);
  });
  it("les lignes d'organisation suivent l'ordre des produits, le connecteur RIS en dernier (jamais devant Talk)", () => {
    const grille = grilleAvec({
      TALK: { base: "PAR_ORGANISATION" }, KONNECT: { base: "PAR_ORGANISATION", montantHtCentimes: 7917 }, CONNECTEUR_RIS: { base: "PAR_ORGANISATION", montantHtCentimes: 1000, pourMille: null },
      INSTALLATION_TALK: { base: "PAR_ORGANISATION" }, INSTALLATION_KONNECT: { base: "PAR_ORGANISATION" },
    });
    const r = preremplir(grille, [centre(1, 2, { offreTalk: true, offreKonnect: true, offreConnecteurRis: true }), centre(2, 1)], { ...aucune, offreTalk: true });
    expect(r.lignes.map((l) => [l.code, l.centreId])).toEqual([
      ["TALK", null], ["INSTALLATION_TALK", null], ["KONNECT", null], ["INSTALLATION_KONNECT", null], ["CONNECTEUR_RIS", null],
    ]);
  });
  it("aucune salle nulle part : aucune ligne, une remarque par centre", () => {
    for (const total of [null, 0]) {
      const r = preremplir(GRILLE_EN_BASE, [centre(1, 0, { offreTalk: true }), centre(2, 0, { offreTalk: true })], aucune, { nombreSalles: total });
      expect(r.lignes).toEqual([]);
      expect(r.remarques).toEqual([{ code: "CENTRE_SANS_SALLE", centreId: 1, tarif: null }, { code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null }]);
    }
  });
  it("centres mêlés : des salles saisies et l'offre du groupe seule, le nombre de salles de la fiche n'est pas réparti", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 2), centre(2, 0)], { ...aucune, offreTalk: true }, { nombreSalles: 9 });
    expect(resume(r)).toEqual([["TALK", 1, 54166, false], ["INSTALLATION_TALK", 1, 62500, false]]);
    expect(r.remarques).toEqual([{ code: "CENTRE_SANS_SALLE", centreId: 2, tarif: null }]);
  });
  it("le tarif du connecteur absent : pas de ligne, une remarque, le reste est chiffré", () => {
    const r = preremplir(grilleAvec({ CONNECTEUR_RIS: null }), [centre(1, 2, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(resume(r)).toEqual([["TALK", 1, 54166, false], ["INSTALLATION_TALK", 1, 62500, false]]);
    expect(r.remarques).toEqual([{ code: "TARIF_ABSENT", centreId: null, tarif: "CONNECTEUR_RIS" }]);
  });
  it("un nombre de salles hors des entiers sûrs est refusé, saisi ou réparti", () => {
    expect(() => preremplir(GRILLE_EN_BASE, [centre(1, Number.MAX_SAFE_INTEGER, { offreTalk: true })], aucune)).toThrow(/entiers sûrs/);
    expect(() => preremplir(GRILLE_EN_BASE, [centre(1, 0, { offreTalk: true })], aucune, { nombreSalles: Number.MAX_SAFE_INTEGER })).toThrow(/entiers sûrs/);
  });
});

describe("preremplir : rôles, produits reliés et base du connecteur (lot S, revue)", () => {
  it("un tarif absent : la remarque dit quel rôle ajouter sur la page Tarifs", () => {
    expect(expliquerRemarque({ code: "TARIF_ABSENT", centreId: null, tarif: "KONNECT" }))
      .toBe("La grille en vigueur n'a pas de tarif pour l'abonnement Konnect. Sur la page Tarifs, ajoutez un tarif de rôle « Abonnement Konnect ».");
    expect(expliquerRemarque({ code: "TARIF_ABSENT", centreId: null, tarif: "INSTALLATION_TALK" })).toMatch(/rôle « Installation Talk »\.$/);
    expect(expliquerRemarque({ code: "TARIF_ABSENT", centreId: null, tarif: "CONNECTEUR_RIS" })).toMatch(/rôle « Connecteur RIS »\.$/);
  });
  it("un tarif de produit sans produit relié : ses lignes sont hors catalogue, une remarque par tarif", () => {
    const r = preremplir(grilleAvec({ TALK: { productId: null }, INSTALLATION_TALK: { productId: null } }), [centre(1, 2, { offreTalk: true, offreConnecteurRis: true }), centre(2, 1, { offreTalk: true })], aucune);
    expect(r.lignes.filter((l) => l.code === "TALK").every((l) => l.productId === null)).toBe(true);
    expect(r.remarques).toEqual([
      { code: "PRODUIT_NON_RELIE", centreId: null, tarif: "TALK" }, { code: "PRODUIT_NON_RELIE", centreId: null, tarif: "INSTALLATION_TALK" },
    ]);
    expect(expliquerRemarque(r.remarques[0]))
      .toBe("Le tarif « Abonnement Talk » n'est relié à aucun produit : ses lignes sont hors catalogue. Reliez-le à son produit sur la page Tarifs.");
  });
  it("le connecteur RIS n'a jamais de produit : aucune remarque pour lui", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(1, 2, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(r.lignes.find((l) => l.code === "CONNECTEUR_RIS")?.productId).toBeNull();
    expect(r.remarques).toEqual([]);
  });
  it("un tarif de produit non offert ne fait pas de remarque, même sans produit", () => {
    expect(preremplir(grilleAvec({ KONNECT: { productId: null } }), [centre(1, 2, { offreTalk: true })], aucune).remarques).toEqual([]);
  });
  it("Talk qui n'est pas par salle : le connecteur reste à 0, avec sa remarque à lui", () => {
    const r = preremplir(grilleAvec({ TALK: { base: "PAR_SITE", montantHtCentimes: 50000 } }), [centre(1, 3, { offreTalk: true, offreConnecteurRis: true })], aucune);
    expect(resume(r).slice(0, 2)).toEqual([["TALK", 1, 50000, false], ["CONNECTEUR_RIS", 1, 0, true]]);
    expect(r.remarques).toEqual([{ code: "CONNECTEUR_HORS_SALLE", centreId: null, tarif: "TALK" }]);
    expect(expliquerRemarque(r.remarques[0]))
      .toBe("L'abonnement Talk n'est pas par salle dans la grille : le connecteur RIS, qui se calcule sur le prix par salle, reste à 0. Chiffrez-le à la main.");
  });
  it("Konnect par organisation : la remarque nomme Konnect, une seule fois sur plusieurs centres", () => {
    const r = preremplir(grilleAvec({ KONNECT: { base: "PAR_ORGANISATION" } }), [centre(1, 1, { offreKonnect: true, offreConnecteurRis: true }), centre(2, 2, { offreKonnect: true, offreConnecteurRis: true })], aucune);
    expect(r.remarques).toEqual([{ code: "CONNECTEUR_HORS_SALLE", centreId: null, tarif: "KONNECT" }]);
    expect(expliquerRemarque(r.remarques[0])).toMatch(/^L'abonnement Konnect n'est pas par salle/);
  });
  it("Talk par site sans connecteur offert : aucune remarque", () => {
    expect(preremplir(grilleAvec({ TALK: { base: "PAR_SITE" } }), [centre(1, 3, { offreTalk: true })], aucune).remarques).toEqual([]);
  });
});

describe("preremplir et estimerMontant : la même règle", () => {
  const combinaisons: OffresPreremplissage[] = [
    { offreTalk: true, offreKonnect: false, offreConnecteurRis: false }, { offreTalk: false, offreKonnect: true, offreConnecteurRis: false },
    { offreTalk: true, offreKonnect: true, offreConnecteurRis: false }, { offreTalk: true, offreKonnect: false, offreConnecteurRis: true },
    { offreTalk: false, offreKonnect: true, offreConnecteurRis: true }, { offreTalk: true, offreKonnect: true, offreConnecteurRis: true },
  ];
  const grilles = [GRILLE_EN_BASE, grilleAvec({ TALK: { montantHtCentimes: 333 }, KONNECT: { montantHtCentimes: 101 }, CONNECTEUR_RIS: { pourMille: 125 } })];
  const mensuel = (lignes: ReturnType<typeof preremplir>["lignes"]) => lignes.filter((l) => l.type === "ABONNEMENT").reduce((s, l) => s + l.montantCentimes, 0);
  const choix = (o: OffresPreremplissage) => ({ talk: o.offreTalk, konnect: o.offreKonnect, connecteurRis: o.offreConnecteurRis });
  it("à un centre, au centime", () => {
    for (const grille of grilles) for (const offres of combinaisons) for (const salles of [1, 2, 7, 40]) {
      const r = preremplir(grille, [centre(1, salles)], offres);
      const e = estimerMontant(salles, choix(offres), grille);
      expect(e).toMatchObject({ complet: true });
      expect(mensuel(r.lignes), JSON.stringify([offres, salles])).toBe(e && e.complet ? e.mensuelCentimes : -1);
    }
  });
  it("à trois centres, au plus un centime d'écart par centre (le connecteur est arrondi par centre)", () => {
    const repartition = [1, 2, 4];
    for (const grille of grilles) for (const offres of combinaisons) {
      const r = preremplir(grille, repartition.map((n, i) => centre(i + 1, n)), offres);
      const e = estimerMontant(7, choix(offres), grille);
      if (!e || !e.complet) throw new Error("estimation incomplète");
      // Les salles se comptent exactement ; seul le connecteur peut s'écarter.
      const salles = r.lignes.filter((l) => l.type === "ABONNEMENT" && l.code !== "CONNECTEUR_RIS").reduce((s, l) => s + l.montantCentimes, 0);
      expect(salles).toBe(e.detail.sallesCentimes);
      expect(Math.abs(mensuel(r.lignes) - e.mensuelCentimes), JSON.stringify(offres)).toBeLessThanOrEqual(repartition.length);
    }
  });
});

describe("preremplir : le calcul de chaque ligne (C-90)", () => {
  it("chaque ligne montre ce qu'elle compte : salles × prix, un site × prix ; le connecteur, un pourcentage, n'en a pas", () => {
    const r = preremplir(GRILLE_EN_BASE, [centre(7, 3, { offreTalk: true, offreConnecteurRis: true })], aucune);
    for (const l of r.lignes) {
      if (l.quantite === null) expect(l.code).toBe("CONNECTEUR_RIS");
      else expect(l.quantite * (l.prixUnitaireCentimes ?? 0)).toBe(l.montantCentimes);
    }
  });
});

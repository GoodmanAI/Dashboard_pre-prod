import { describe, expect, it } from "vitest";
import { GRILLE_VIDE, grilleDepuisTarifs } from "@/pilot/lib/tarifs/grille";
import { GRILLE_EN_BASE, REGLAGES_CALCULATEUR_2026, grilleDepuisReglages, tarifsDepuisReglages } from "./grilleEssai";
import { avisGrille, prixDepuisGrille, ttcDepuisHt } from "./prix";

/** L'ancien `prixHt` de l'apport, d'avant le lot S, recopié pour comparer. */
const ancienPrixHt = (ttc: number, tvaPdm: number) => Math.round((ttc * 10000) / (10000 + tvaPdm));

describe("prixDepuisGrille : la grille commune vers les prix de l'apport (lot S)", () => {
  it("la grille en base donne les prix d'avant, au centime", () => {
    const { prix, manquants } = prixDepuisGrille(GRILLE_EN_BASE, 2000);
    expect(manquants).toEqual([]);
    expect(prix).toEqual({
      talkHtCentimes: ancienPrixHt(32500, 2000), konnectHtCentimes: ancienPrixHt(9500, 2000), connecteurRisPdm: 1500,
      // Les installations : le TTC que l'apport affichait, 750 € et 450 €, par site.
      installationTalk: { ttcCentimes: 75000, mode: "site" }, installationKonnect: { ttcCentimes: 45000, mode: "site" },
    });
    expect(prix.talkHtCentimes).toBe(27083);
    expect(prix.konnectHtCentimes).toBe(7917);
  });

  it("la grille reprise des réglages par le SQL du lot S est celle qui est en base", () => {
    expect(grilleDepuisReglages(REGLAGES_CALCULATEUR_2026)).toEqual(GRILLE_EN_BASE);
  });

  // Compare le portage TypeScript du SQL (tarifsDepuisReglages), pas le SQL lui-même : celui-ci n'est pas exécuté par les tests unitaires.
  it("TTC vers HT : le portage TypeScript de la conversion du SQL donne l'ancien prixHt, pour tout montant de 0 à 2 000 €", () => {
    // Les commissions se calculent sur le HT : elles ne bougent donc pour aucun prix saisi autrefois.
    for (const tva of [0, 550, 1000, 2000]) {
      for (let ttc = 0; ttc <= 200000; ttc++) {
        const ht = tarifsDepuisReglages({ ...REGLAGES_CALCULATEUR_2026, talkTtcCentimes: ttc, tvaPdm: tva })[0].montantHtCentimes;
        if (ht !== ancienPrixHt(ttc, tva)) throw new Error(`Écart pour ${ttc} centimes TTC à ${tva} points de TVA`);
      }
    }
  });

  it("l'aller-retour TTC → HT → TTC garde les prix de l'apport, et peut décaler un autre prix d'un centime", () => {
    for (const ttc of [32500, 9500, 75000, 45000]) expect(ttcDepuisHt(ancienPrixHt(ttc, 2000), 2000)).toBe(ttc);
    // 333,33 € TTC → 277,78 € HT → 333,34 € TTC : le TTC affiché bouge d'un centime, le HT (et la commission) non.
    expect(ancienPrixHt(33333, 2000)).toBe(27778);
    expect(ttcDepuisHt(27778, 2000)).toBe(33334);
  });

  it("le connecteur RIS : le pour-mille de la grille vaut dix points de base ; un réglage hors dizaine s'arrondit", () => {
    expect(prixDepuisGrille(grilleDepuisReglages({ ...REGLAGES_CALCULATEUR_2026, connecteurRisPdm: 1525 }), 2000).prix.connecteurRisPdm).toBe(1530);
  });

  it("la base de chaque installation donne son mode : par site, par groupe, par salle", () => {
    for (const [mode, attendu] of [["site", "site"], ["groupe", "groupe"], ["salle", "salle"]] as const) {
      const { prix } = prixDepuisGrille(grilleDepuisReglages({ ...REGLAGES_CALCULATEUR_2026, modeInstallation: mode }), 2000);
      expect(prix.installationTalk.mode).toBe(attendu);
      expect(prix.installationKonnect.mode).toBe(attendu);
    }
    const tarifs = tarifsDepuisReglages(REGLAGES_CALCULATEUR_2026).map((t) => t.code === "INSTALLATION_KONNECT" ? { ...t, base: "PAR_SALLE" as const } : t);
    const { prix } = prixDepuisGrille(grilleDepuisTarifs({ id: 2, applicableLe: new Date("2027-01-01T00:00:00Z") }, tarifs), 2000);
    expect(prix.installationTalk.mode).toBe("site");
    expect(prix.installationKonnect.mode).toBe("salle");
  });

  it("la TVA des réglages de l'apport ramène les installations en TTC", () => {
    expect(prixDepuisGrille(GRILLE_EN_BASE, 1000).prix.installationTalk.ttcCentimes).toBe(68750);
    expect(prixDepuisGrille(GRILLE_EN_BASE, 0).prix.installationTalk.ttcCentimes).toBe(62500);
  });

  it("un prix à renseigner, d'une autre base ou absent compte pour zéro et se signale", () => {
    const tarifs = GRILLE_EN_BASE.tarifs.map((t) =>
      t.code === "TALK" ? { ...t, montantHtCentimes: null } : t.code === "KONNECT" ? { ...t, base: "PAR_SITE" as const } : t)
      .filter((t) => t.code !== "INSTALLATION_KONNECT");
    const { prix, manquants } = prixDepuisGrille({ tarifs }, 2000);
    expect(manquants).toEqual(["TALK", "KONNECT", "INSTALLATION_KONNECT"]);
    expect(prix).toMatchObject({ talkHtCentimes: 0, konnectHtCentimes: 0, connecteurRisPdm: 1500, installationKonnect: { ttcCentimes: 0 } });
  });

  it("sans grille, tout compte pour zéro : jamais un prix inventé", () => {
    const { prix, manquants } = prixDepuisGrille(GRILLE_VIDE, 2000);
    expect(manquants).toEqual(["TALK", "KONNECT", "CONNECTEUR_RIS", "INSTALLATION_TALK", "INSTALLATION_KONNECT"]);
    expect(prix).toEqual({ talkHtCentimes: 0, konnectHtCentimes: 0, connecteurRisPdm: 0,
      installationTalk: { ttcCentimes: 0, mode: "site" }, installationKonnect: { ttcCentimes: 0, mode: "site" } });
  });
});

describe("avisGrille : l'écran dit pourquoi un montant est à zéro", () => {
  it("rien à dire quand la grille donne tout", () => {
    expect(avisGrille({ id: 1, manquants: [] })).toBeNull();
  });
  it("aucune grille en vigueur", () => {
    expect(avisGrille({ id: null, manquants: ["TALK"] })).toBe("Aucune grille tarifaire en vigueur : récurrents et commissions restent à zéro. Créez la grille sur la page Tarifs.");
  });
  it("un ou plusieurs tarifs sans prix, nommés : renseignez leur prix", () => {
    expect(avisGrille({ id: 1, manquants: ["CONNECTEUR_RIS"] })).toBe(
      "La grille en vigueur n'a pas de prix pour le pourcentage du connecteur RIS. Renseignez son prix sur la page Tarifs. Ce prix compte pour zéro.");
    expect(avisGrille({ id: 1, manquants: ["TALK", "KONNECT", "INSTALLATION_TALK"], absents: [] })).toBe(
      "La grille en vigueur n'a pas de prix pour l'abonnement Talk par salle, l'abonnement Konnect par salle et l'installation Talk. Renseignez leurs prix sur la page Tarifs. Ces prix comptent pour zéro.");
  });
  it("un tarif absent de la grille : ajoutez son rôle, distinct d'un tarif sans prix", () => {
    expect(avisGrille({ id: 1, manquants: ["KONNECT"], absents: ["KONNECT"] })).toBe(
      "La grille en vigueur n'a pas de tarif pour l'abonnement Konnect par salle. Ajoutez le rôle « Abonnement Konnect » sur la page Tarifs. Ce prix compte pour zéro.");
    expect(avisGrille({ id: 1, manquants: ["TALK", "CONNECTEUR_RIS", "INSTALLATION_KONNECT"], absents: ["CONNECTEUR_RIS", "INSTALLATION_KONNECT"] })).toBe(
      "La grille en vigueur n'a pas de tarif pour le pourcentage du connecteur RIS et l'installation Konnect. Ajoutez les rôles « Connecteur RIS » et « Installation Konnect » sur la page Tarifs. "
      + "Elle n'a pas de prix pour l'abonnement Talk par salle. Renseignez son prix sur la page Tarifs. Ces prix comptent pour zéro.");
  });
  it("prixDepuisGrille distingue un tarif absent d'un tarif sans prix", () => {
    const sansKonnect = GRILLE_EN_BASE.tarifs.filter((t) => t.code !== "KONNECT").map((t) => t.code === "TALK" ? { ...t, montantHtCentimes: null } : t);
    const r = prixDepuisGrille({ tarifs: sansKonnect }, 2000);
    expect(r.manquants).toEqual(["TALK", "KONNECT"]);
    expect(r.absents).toEqual(["KONNECT"]);
    expect(prixDepuisGrille(GRILLE_EN_BASE, 2000).absents).toEqual([]);
  });
});

describe("prixDepuisGrille : zéro est un prix, le jour d'application est UTC (cas limites)", () => {
  it("un tarif à 0 € ou un taux à 0 ‰ est un prix, pas un manque", () => {
    const tarifs = GRILLE_EN_BASE.tarifs.map((t) =>
      t.code === "TALK" || t.code === "KONNECT" || t.code === "INSTALLATION_TALK" ? { ...t, montantHtCentimes: 0 }
        : t.code === "CONNECTEUR_RIS" ? { ...t, pourMille: 0 } : t);
    const { prix, manquants } = prixDepuisGrille({ tarifs }, 2000);
    expect(manquants).toEqual([]);
    expect(prix).toEqual({ talkHtCentimes: 0, konnectHtCentimes: 0, connecteurRisPdm: 0,
      installationTalk: { ttcCentimes: 0, mode: "site" }, installationKonnect: { ttcCentimes: 45000, mode: "site" } });
    expect(avisGrille({ id: 1, manquants })).toBeNull();
  });
  it("le jour d'application est le jour UTC, quelle que soit l'heure ou le fuseau d'écriture", () => {
    const jour = (iso: string) => grilleDepuisTarifs({ id: 3, applicableLe: new Date(iso) }, GRILLE_EN_BASE.tarifs).applicableLe;
    expect(jour("2026-11-18T00:00:00Z")).toBe("2026-11-18");
    expect(jour("2026-11-18T23:59:59.999Z")).toBe("2026-11-18");
    expect(jour("2026-11-19T00:30:00+01:00")).toBe("2026-11-18");
    expect(jour("2026-11-18T23:30:00-05:00")).toBe("2026-11-19");
  });
});

describe("ttcDepuisHt : arithmétique entière exacte", () => {
  it("donne au centime ce que donnait l'ancien calcul flottant sur une large plage", () => {
    for (const tva of [0, 550, 1000, 2000, 2050])
      for (let ht = 0; ht <= 50000; ht += 7) expect(ttcDepuisHt(ht, tva)).toBe(Math.round((ht * (10000 + tva)) / 10000));
  });
  it("le demi-centime monte", () => {
    expect(ttcDepuisHt(5, 1000)).toBe(6); // 5,5 centimes
    expect(ttcDepuisHt(25, 2000)).toBe(30);
  });
  it("reste exact là où le produit flottant ne l'est plus", () => {
    const ht = 2 ** 50 + 1;
    expect(ttcDepuisHt(ht, 2000)).toBe(Number((2n * BigInt(ht) * 12000n + 10000n) / 20000n));
  });
});

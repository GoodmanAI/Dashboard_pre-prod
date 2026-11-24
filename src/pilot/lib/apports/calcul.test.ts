import { describe, expect, it } from "vitest";
import {
  ajouterMois, ajouterMoisAuJour, appliquerTaux, calculGroupe, calendrier, caducite, creerMoteur, etatDecision, pourcentage,
  prixHt, recurrentDesSalles, sirenValide, statutCommande, syntheseModalites, tauxPour, type Contexte, type GroupeCalcul,
} from "./calcul";
import { PRIX_EN_BASE } from "./grilleEssai";
import type { ModeInstallation } from "./referentiel";
import { PARAMETRES_DEFAUT } from "./referentiel";

/** Les réglages par défaut et les prix de la grille en vigueur (lot S). */
const P = { ...PARAMETRES_DEFAUT, apporteurParDefautId: 1, prix: PRIX_EN_BASE };
const avecMode = (mode: ModeInstallation) => ({ ...P, prix: { ...P.prix,
  installationTalk: { ...P.prix.installationTalk, mode }, installationKonnect: { ...P.prix.installationKonnect, mode } } });
const salles = (n: number, modalite = "RX") => Array.from({ length: n }, () => ({ modalite }));

function groupe(id: number, champs: Partial<GroupeCalcul> = {}): GroupeCalcul {
  return {
    id, nom: `Groupe ${id}`, creeLe: `2026-01-0${id}T00:00:00Z`, apporteurId: 1, coApporteurId: null, coApporteurPart: 30,
    offreTalk: true, offreKonnect: true, offreConnecteurRis: false,
    bcEnvoyeLe: null, commandeValideeLe: null, commandeInstalleeLe: null, deploiementPrevuLe: null,
    decision: "attente", decisionLe: null, signaleLe: null,
    sites: [{ id: id * 10, nom: "Site 1", offreTalk: false, offreKonnect: false, offreConnecteurRis: false, salles: salles(2) }],
    ...champs,
  };
}
function contexte(groupes: GroupeCalcul[], champs: Partial<Contexte> = {}): Contexte {
  return {
    parametres: P, groupes, factures: [], aujourdhui: "2026-11-06", moisCourant: "2026-11",
    apporteurs: [
      { id: 1, nom: "Apporteur principal", structure: "ENTHESIS", commissionne: true },
      { id: 2, nom: "Second apporteur", structure: null, commissionne: true },
      { id: 3, nom: "Vente directe", structure: null, commissionne: false },
    ],
    ...champs,
  };
}

describe("grille et montants", () => {
  it("prend les prix HT de la grille en vigueur : Talk et Konnect font 350 € HT par salle", () => {
    const u = prixHt(P);
    expect(u.talk + u.konnect).toBe(35000);
  });
  it("calcule le récurrent, le connecteur et l'installation par site", () => {
    const c = calculGroupe(groupe(1, { offreConnecteurRis: true }), P);
    expect(c.recurrent).toBe(70000);
    expect(c.connecteur).toBe(10500);
    expect(c.installation).toBe(120000);
    expect(c.sallesActives).toBe(2);
  });
  it("ne compte pas un site sans Talk ni Konnect", () => {
    const g = groupe(1, { offreTalk: false, offreKonnect: false });
    const c = calculGroupe(g, P);
    expect(c.recurrent).toBe(0);
    expect(c.sitesActifs).toBe(0);
  });
  it("facture l'installation une fois par groupe ou par salle selon le réglage", () => {
    const g = groupe(1, { sites: [groupe(1).sites[0], { ...groupe(1).sites[0], id: 11, salles: salles(3) }] });
    expect(calculGroupe(g, avecMode("groupe")).installation).toBe(120000);
    expect(calculGroupe(g, avecMode("salle")).installation).toBe(600000);
  });
  it("applique le palier au portefeuille entier", () => {
    expect(tauxPour(400000, P)).toBe(250);
    expect(tauxPour(400001, P)).toBe(500);
    expect(tauxPour(1250001, P)).toBe(1000);
    expect(appliquerTaux(35000, 250)).toBe(875);
  });
  it("écrit les taux sans flottant", () => {
    expect(pourcentage(250)).toBe("2,5 %");
    expect(pourcentage(1000)).toBe("10 %");
    expect(pourcentage(1225)).toBe("12,25 %");
  });
});

describe("parcours et calendrier", () => {
  it("prend l'étape la plus avancée dont la date est posée", () => {
    expect(statutCommande(groupe(1))).toBe("prospect");
    expect(statutCommande(groupe(1, { bcEnvoyeLe: "2026-01-01", commandeInstalleeLe: "2026-03-01" }))).toBe("installee");
  });
  it("encaisse un mois après l'installation", () => {
    expect(calendrier(groupe(1, { commandeInstalleeLe: "2026-05-12" }), P, "2026-11")).toEqual({ debut: "2026-06", fin: null, nature: "place", reporte: false });
  });
  it("reporte au mois en cours une date prévue dépassée", () => {
    const g = groupe(1, { commandeValideeLe: "2026-04-01", deploiementPrevuLe: "2026-06-01" });
    expect(calendrier(g, P, "2026-11")).toMatchObject({ debut: "2026-11", nature: "venir", reporte: true });
  });
  it("écarte les prospects du prévisionnel par défaut", () => {
    expect(calendrier(groupe(1, { deploiementPrevuLe: "2027-03-01" }), P, "2026-11")).toBeNull();
    expect(calendrier(groupe(1, { deploiementPrevuLe: "2027-03-01" }), { ...P, inclureProspects: true }, "2026-11")?.debut).toBe("2027-04");
  });
  it("limite la durée de commission quand elle est réglée", () => {
    expect(calendrier(groupe(1, { commandeInstalleeLe: "2026-05-12" }), { ...P, dureeCommissionMois: 12 }, "2026-11")?.fin).toBe("2027-05");
  });
  it("compte les mois sans flottant", () => {
    expect(ajouterMois("2026-11", 3)).toBe("2027-02");
    expect(ajouterMois("2026-01", -1)).toBe("2025-12");
    expect(ajouterMoisAuJour("2026-01-31", 1)).toBe("2026-03-03");
  });
});

describe("décision et caducité", () => {
  it("valide douze mois, prorogés par un bon de commande", () => {
    expect(caducite({ decision: "valide", decisionLe: "2026-01-10", bcEnvoyeLe: null })).toBe("2027-01-10");
    expect(caducite({ decision: "valide", decisionLe: "2026-01-10", bcEnvoyeLe: "2026-06-01" })).toBe("2027-06-01");
    expect(caducite({ decision: "attente", decisionLe: null, bcEnvoyeLe: null })).toBeNull();
  });
  it("signale une demande sans réponse après sept jours", () => {
    expect(etatDecision(groupe(1, { signaleLe: "2026-11-01" }), "2026-11-06").cle).toBe("soumis");
    expect(etatDecision(groupe(1, { signaleLe: "2026-10-20" }), "2026-11-06").cle).toBe("alerte");
    expect(etatDecision(groupe(1, { decision: "valide", decisionLe: "2025-10-01" }), "2026-11-06").cle).toBe("caduc");
    expect(etatDecision(groupe(1), "2026-11-06").libelle).toBe("À signaler");
  });
  it("vérifie la clé du SIREN", () => {
    expect(sirenValide("910 456 573")).toBe(true);
    expect(sirenValide("910456574")).toBe(false);
    expect(sirenValide("12345")).toBe(false);
    expect(sirenValide("")).toBeNull();
  });
});

describe("commissions du mois", () => {
  it("applique le taux du palier à tout le portefeuille, autres clients compris", () => {
    const g = groupe(1, { commandeInstalleeLe: "2026-05-12" });
    const m = creerMoteur(contexte([g], { parametres: { ...P, autresClientsCentimes: 400000 } }));
    const c = m.calculMois("2026-11", 1);
    expect(c.portefeuillePlace).toBe(470000);
    expect(c.tauxPdm).toBe(500);
    expect(c.commissionPlace).toBe(3500);
  });
  it("partage un groupe entre apporteur et co-apporteur", () => {
    const g = groupe(1, { commandeInstalleeLe: "2026-05-12", coApporteurId: 2, coApporteurPart: 30 });
    const m = creerMoteur(contexte([g]));
    expect(m.calculMois("2026-11", 1).basePlace).toBe(49000);
    expect(m.calculMois("2026-11", 2).basePlace).toBe(21000);
    expect(m.calculMois("2026-11", "tous").basePlace).toBe(70000);
  });
  it("ne commissionne pas la vente directe mais la garde dans la vue d'ensemble", () => {
    const g = groupe(1, { apporteurId: 3, commandeInstalleeLe: "2026-05-12" });
    const m = creerMoteur(contexte([g]));
    expect(m.calculMois("2026-11", 3).commissionPlace).toBe(0);
    expect(m.calculMois("2026-11", "tous").basePlace).toBe(70000);
    expect(m.moisFacturables(3)).toEqual([]);
  });
  it("sépare le socle sécurisé du prévisionnel", () => {
    const place = groupe(1, { commandeInstalleeLe: "2026-05-12", sites: [{ ...groupe(1).sites[0], salles: salles(11) }] });
    const venir = groupe(2, { commandeValideeLe: "2026-09-01", deploiementPrevuLe: "2026-12-01", sites: [{ ...groupe(2).sites[0], salles: salles(2) }] });
    const c = creerMoteur(contexte([place, venir])).calculMois("2027-01", 1);
    expect(c.portefeuillePlace).toBe(385000);
    expect(c.tauxPdm).toBe(500);
    expect(c.socle).toBe(appliquerTaux(385000, 250));
  });
  it("prend l'encaissé saisi à la place du théorique, et fige la facture émise", () => {
    const g = groupe(1, { commandeInstalleeLe: "2026-05-12" });
    const avecEncaisse = creerMoteur(contexte([g], { factures: [{ apporteurId: 1, mois: "2026-10", statut: "a_emettre", numero: null,
      emiseLe: null, echeanceLe: null, payeeLe: null, encaissements: { "1": 60000 }, fige: null }] }));
    expect(avecEncaisse.calculFacture("2026-10", 1).baseCentimes).toBe(60000);
    const figee = { ...avecEncaisse.calculFacture("2026-10", 1), lignes: [], commissionCentimes: 1234 };
    const m = creerMoteur(contexte([g], { factures: [{ apporteurId: 1, mois: "2026-10", statut: "emise", numero: "ENT-NEU-2026-10",
      emiseLe: "2026-11-01", echeanceLe: "2026-11-16", payeeLe: null, encaissements: {}, fige: figee }] }));
    expect(m.calculFacture("2026-10", 1).commissionCentimes).toBe(1234);
    expect(m.statutFacture("2026-10", 1)).toBe("emise");
    expect(m.statutFacture("2026-09", 1)).toBe("a_emettre");
    expect(m.statutFacture("2026-11", 1)).toBe("encours");
  });
  it("liste les mois facturables du premier encaissement au mois en cours", () => {
    const m = creerMoteur(contexte([groupe(1, { commandeInstalleeLe: "2026-08-20" })]));
    expect(m.moisFacturables(1)).toEqual(["2026-11", "2026-10", "2026-09"]);
  });
  it("chiffre ce qui manque pour le palier suivant", () => {
    const m = creerMoteur(contexte([groupe(1, { commandeInstalleeLe: "2026-05-12" })]));
    const j = m.jauge(1);
    expect(j.commissionne && j.manque).toBe(330001);
    expect(j.commissionne && j.salles).toBe(10);
  });
});

describe("synthèse des modalités", () => {
  it("range les sites sans offre à part", () => {
    const g = groupe(1, { offreTalk: false, offreKonnect: false, sites: [
      { id: 10, nom: "A", offreTalk: true, offreKonnect: false, offreConnecteurRis: false, salles: salles(2, "IRM") },
      { id: 11, nom: "B", offreTalk: false, offreKonnect: false, offreConnecteurRis: false, salles: salles(1, "CT") },
    ] });
    const s = syntheseModalites([g]);
    expect(s.groupes.prospect).toBe(1);
    expect(s.sites.off).toBe(1);
    expect(s.modalites.get("IRM")?.prospect).toBe(2);
    expect(s.modalites.get("CT")?.off).toBe(1);
  });
});

describe("appliquerTaux et recurrentDesSalles : la règle partagée avec l'estimation d'un prospect", () => {
  it("rend le même centime que Math.round sur les entiers usuels, demis compris", () => {
    // Même valeur, au centime près : seul le zéro négatif de Math.round devient un zéro ordinaire.
    for (let centimes = -3000; centimes <= 3000; centimes += 7) {
      for (const pdm of [0, 1, 50, 250, 1500, 2000, 9999, 10000]) expect(appliquerTaux(centimes, pdm) === Math.round((centimes * pdm) / 10000)).toBe(true);
    }
    expect(appliquerTaux(1, 5000)).toBe(1);
    expect(appliquerTaux(-1, 5000)).toBe(0);
    expect(appliquerTaux(3, 5000)).toBe(2);
    expect(appliquerTaux(-3, 5000)).toBe(-1);
  });
  it("reste exact au-delà de la précision d'un flottant", () => {
    const centimes = 900719925474099, pdm = 1500;
    const attendu = Number((2n * BigInt(centimes) * BigInt(pdm) + 10000n) / 20000n);
    expect(appliquerTaux(centimes, pdm)).toBe(attendu);
  });
  it("chaque salle paie chaque offre cochée, le connecteur s'ajoute arrondi une fois", () => {
    const prix = { talkCentimes: 20000, konnectCentimes: 15000, connecteurRisPdm: 1500 };
    expect(recurrentDesSalles(2, { talk: true, konnect: false, ris: true }, prix)).toEqual({ recurrent: 40000, connecteur: 6000 });
    expect(recurrentDesSalles(3, { talk: true, konnect: true, ris: false }, prix)).toEqual({ recurrent: 105000, connecteur: 0 });
    expect(recurrentDesSalles(1, { talk: false, konnect: false, ris: true }, prix)).toEqual({ recurrent: 0, connecteur: 0 });
    // 3 × 33,33 € = 99,99 € ; 15 % = 14,9985 € arrondi à 15,00 €, une seule fois.
    expect(recurrentDesSalles(3, { talk: true, konnect: false, ris: true }, { ...prix, talkCentimes: 3333 })).toEqual({ recurrent: 9999, connecteur: 1500 });
  });
  it("calculGroupe passe par elle : mêmes montants par site", () => {
    const g = groupe(1);
    const c = calculGroupe(g, P);
    const u = prixHt(P);
    const site = g.sites[0];
    const attendu = recurrentDesSalles(site.salles.length, { talk: g.offreTalk || site.offreTalk, konnect: g.offreKonnect || site.offreKonnect, ris: g.offreConnecteurRis || site.offreConnecteurRis },
      { talkCentimes: u.talk, konnectCentimes: u.konnect, connecteurRisPdm: P.prix.connecteurRisPdm });
    expect({ recurrent: c.sites[0].recurrent, connecteur: c.sites[0].connecteur }).toEqual(attendu);
  });
});

describe("installations en modes mixtes (Talk et Konnect de bases différentes)", () => {
  // Prix de PRIX_EN_BASE, TTC : Talk 750 € (75000), Konnect 450 € (45000). Groupe de 3 sites : 3, 2 et 0 salles, Talk et Konnect cochés au groupe.
  const mixte = (talk: ModeInstallation, konnect: ModeInstallation) => ({ ...P, prix: { ...P.prix,
    installationTalk: { ...P.prix.installationTalk, mode: talk }, installationKonnect: { ...P.prix.installationKonnect, mode: konnect } } });
  const sites = (...nombres: number[]) => nombres.map((n, i) => ({ id: 10 + i, nom: `Site ${i + 1}`, offreTalk: false, offreKonnect: false, offreConnecteurRis: false, salles: salles(n) }));
  const g = groupe(1, { sites: sites(3, 2, 0) });
  it("PRIX_EN_BASE : 750 € pour Talk, 450 € pour Konnect", () => {
    expect([PRIX_EN_BASE.installationTalk.ttcCentimes, PRIX_EN_BASE.installationKonnect.ttcCentimes]).toEqual([75000, 45000]);
  });
  it.each([
    ["site", "salle", 375000],    // Talk : 2 sites équipés x 75000 = 150000 ; Konnect : 5 salles x 45000 = 225000
    ["groupe", "salle", 300000],  // 75000 + 225000
    ["salle", "groupe", 420000],  // Talk : 5 x 75000 = 375000 ; Konnect : 45000
    ["site", "groupe", 195000],   // 150000 + 45000
    ["groupe", "groupe", 120000], // 75000 + 45000
  ] as const)("Talk par %s, Konnect par %s : %i centimes", (talk, konnect, attendu) => {
    expect(calculGroupe(g, mixte(talk, konnect)).installation).toBe(attendu);
  });
  it("un seul site à 0 salle : 0 en mode site comme en mode groupe, ou par salle", () => {
    const vide = groupe(1, { sites: sites(0) });
    for (const mode of ["site", "groupe", "salle"] as const) expect(calculGroupe(vide, avecMode(mode)).installation).toBe(0);
    expect(calculGroupe(vide, mixte("site", "groupe")).installation).toBe(0);
  });
});

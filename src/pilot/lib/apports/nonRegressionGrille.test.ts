import { describe, expect, it } from "vitest";
import { calculGroupe, creerMoteur, type Contexte, type GroupeCalcul, type ParametresCalcul } from "./calcul";
import { GRILLE_EN_BASE, REGLAGES_CALCULATEUR_2026, grilleDepuisReglages } from "./grilleEssai";
import { prixDepuisGrille, type PrixApport } from "./prix";
import { PARAMETRES_DEFAUT, type ModeInstallation } from "./referentiel";

/**
 * Non-régression du lot S : l'apport d'affaires lit la grille commune.
 *
 * Le jeu reprend le seed (prisma/seed.ts), figé au 18/11/2026 : Alpha installé
 * depuis cinq mois, Delta en bon de commande partagé à 30 %, Lambda signalé,
 * Nu en vente directe, les réglages par défaut. Les commissions mois par mois
 * et le prévisionnel sont figés au centime.
 *
 * Les valeurs attendues ont été produites par le moteur d'avant le lot S, qui
 * lisait les prix TTC de `CrmParametresApport` et les ramenait en HT par
 * `prixHt`. Elles ne se régénèrent pas : un écart d'un centime est une régression.
 */

const AUJOURDHUI = "2026-11-18";
const site = (id: number, nom: string, n: number, offres: Partial<Record<"offreTalk" | "offreKonnect" | "offreConnecteurRis", boolean>> = {}) => ({
  id, nom, offreTalk: false, offreKonnect: false, offreConnecteurRis: false, ...offres,
  salles: Array.from({ length: n }, () => ({ modalite: "RX" })),
});
const base = { coApporteurId: null, coApporteurPart: 30, offreTalk: false, offreKonnect: false, offreConnecteurRis: false,
  bcEnvoyeLe: null, commandeValideeLe: null, commandeInstalleeLe: null, deploiementPrevuLe: null,
  decision: "attente", decisionLe: null, signaleLe: null } as const;

const GROUPES: GroupeCalcul[] = [
  { ...base, id: 1, nom: "Groupe Alpha", creeLe: "2026-01-10T09:00:00.000Z", apporteurId: 1, offreTalk: true, offreKonnect: true,
    signaleLe: "2026-03-23", decision: "valide", decisionLe: "2026-03-27",
    bcEnvoyeLe: "2026-05-02", commandeValideeLe: "2026-05-12", commandeInstalleeLe: "2026-06-21",
    sites: [site(11, "Site principal", 5)] },
  { ...base, id: 2, nom: "Groupe Delta", creeLe: "2026-02-10T09:00:00.000Z", apporteurId: 1, coApporteurId: 2, coApporteurPart: 30,
    offreKonnect: true, signaleLe: "2026-09-19", decision: "valide", decisionLe: "2026-09-24",
    bcEnvoyeLe: "2026-10-29", deploiementPrevuLe: "2027-01-02",
    sites: [site(21, "Site Delta Nord", 4, { offreTalk: true }), site(22, "Site Delta Sud", 2)] },
  { ...base, id: 3, nom: "Groupe Lambda", creeLe: "2026-03-10T09:00:00.000Z", apporteurId: 2, signaleLe: "2026-11-08",
    sites: [site(31, "Site 1", 3, { offreTalk: true, offreKonnect: true })] },
  { ...base, id: 4, nom: "Groupe Nu", creeLe: "2025-09-10T09:00:00.000Z", apporteurId: 3, offreTalk: true, commandeInstalleeLe: "2025-10-14",
    sites: [site(41, "Cabinet principal", 2)] },
];
const APPORTEURS = [
  { id: 1, nom: "Apporteur Un", structure: "Cabinet de conseil Un", commissionne: true },
  { id: 2, nom: "Apporteur Deux", structure: "Conseil Deux", commissionne: true },
  { id: 3, nom: "Vente directe", structure: "Neuracorp AI (vente directe)", commissionne: false },
];
/** Un encaissé saisi et une facture émise figée, pour couvrir les deux chemins de la base. */
const FACTURES: Contexte["factures"] = [
  { apporteurId: 1, mois: "2026-09", statut: "a_emettre", numero: null, emiseLe: null, echeanceLe: null, payeeLe: null,
    encaissements: { "1": 150000 }, fige: null },
];

function contexte(parametres: ParametresCalcul): Contexte {
  return { parametres, apporteurs: APPORTEURS, groupes: GROUPES, factures: FACTURES, aujourdhui: AUJOURDHUI, moisCourant: AUJOURDHUI.slice(0, 7) };
}

/** Tout ce que l'apport calcule avec des prix, en lignes lisibles. */
function empreinte(parametres: ParametresCalcul): string[] {
  const m = creerMoteur(contexte(parametres));
  const lignes: string[] = [];
  for (const g of m.groupes) {
    const c = m.calcul(g);
    lignes.push(`groupe ${g.nom}: recurrent=${c.recurrent} connecteur=${c.connecteur} installation=${c.installation}`);
  }
  for (const mois of m.moisAffiches()) {
    lignes.push(`${mois} ` + ([1, 2, 3, "tous"] as const).map((v) => {
      const c = m.calculMois(mois, v);
      return `${v}[pp=${c.portefeuillePlace} pf=${c.portefeuille} t=${c.tauxPdm} cp=${c.commissionPlace} cv=${c.commissionVenir} s=${c.socle}]`;
    }).join(" "));
  }
  for (const a of [1, 2]) {
    for (const mois of m.moisFacturables(a)) {
      const f = m.calculFacture(mois, a);
      lignes.push(`facture ${a} ${mois}: base=${f.baseCentimes} taux=${f.tauxPdm} commission=${f.commissionCentimes} ttc=${f.ttcCentimes}`);
    }
  }
  for (const g of m.groupes) lignes.push(`actuelle ${g.nom}: ` + m.commissionActuelle(g).map((x) => `${x.apporteurId}:${x.part}%:${x.tauxPdm}:${x.commission}`).join(" "));
  const j = m.jauge(1);
  lignes.push(`jauge 1: ${JSON.stringify(j)}`);
  const i = m.indicateurs("tous");
  lignes.push(`indicateurs: placeAnnee=${i.placeAnnee} venirAnnee=${i.venirAnnee} aEmettre=${i.aEmettre} aEncaisser=${i.aEncaisser}`);
  return lignes;
}

/** Les mêmes groupes avec le connecteur RIS, sous les trois modes d'installation : ce que la grille porte en plus. */
function empreinteOffres(parametres: ParametresCalcul): string[] {
  const modes = (["site", "groupe", "salle"] as ModeInstallation[]).map((mode): ParametresCalcul => ({ ...parametres, prix: { ...parametres.prix,
    installationTalk: { ...parametres.prix.installationTalk, mode }, installationKonnect: { ...parametres.prix.installationKonnect, mode } } }));
  return modes.flatMap((p) => GROUPES.map((g) => {
    const c = calculGroupe({ ...g, offreConnecteurRis: true }, p);
    return `${g.nom}: recurrent=${c.recurrent} connecteur=${c.connecteur} installation=${c.installation}`;
  }));
}

const parametres = (prix: PrixApport): ParametresCalcul => ({ ...PARAMETRES_DEFAUT, apporteurParDefautId: 1, prix });
/** Avant : la grille tirée des anciens réglages TTC de l'apport, convertie comme le SQL du lot S (et l'ancien `prixHt`). */
const DEPUIS_REGLAGES = parametres(prixDepuisGrille(grilleDepuisReglages(REGLAGES_CALCULATEUR_2026), PARAMETRES_DEFAUT.tvaPdm).prix);
/** Après : la grille telle qu'elle est dans `CrmGrilleTarifaire`, en objets. */
const DEPUIS_GRILLE = parametres(prixDepuisGrille(GRILLE_EN_BASE, PARAMETRES_DEFAUT.tvaPdm).prix);

/** Produit par le moteur d'avant le lot S (réglages par défaut, prix TTC des paramètres de l'apport). */
const ATTENDU = [
  "groupe Groupe Nu: recurrent=54166 connecteur=0 installation=75000",
  "groupe Groupe Alpha: recurrent=175000 connecteur=0 installation=120000",
  "groupe Groupe Delta: recurrent=155834 connecteur=0 installation=165000",
  "groupe Groupe Lambda: recurrent=105000 connecteur=0 installation=120000",
  "2025-11 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2025-12 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-01 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-02 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-03 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-04 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-05 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-06 1[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=54166 pf=54166 t=null cp=0 cv=0 s=0]",
  "2026-07 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2026-08 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2026-09 1[pp=175000 pf=175000 t=250 cp=3750 cv=0 s=3750] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=3750 cv=0 s=3750]",
  "2026-10 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2026-11 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2026-12 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2027-01 1[pp=175000 pf=175000 t=250 cp=4375 cv=0 s=4375] 2[pp=0 pf=0 t=250 cp=0 cv=0 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=229166 t=250 cp=4375 cv=0 s=4375]",
  "2027-02 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-03 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-04 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-05 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-06 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-07 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-08 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-09 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-10 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-11 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2027-12 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2028-01 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2028-02 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2028-03 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "2028-04 1[pp=175000 pf=284084 t=250 cp=4375 cv=2727 s=4375] 2[pp=0 pf=46750 t=250 cp=0 cv=1169 s=0] 3[pp=54166 pf=54166 t=0 cp=0 cv=0 s=0] tous[pp=229166 pf=385000 t=null cp=4375 cv=3896 s=4375]",
  "facture 1 2026-11: base=175000 taux=250 commission=4375 ttc=5250",
  "facture 1 2026-10: base=175000 taux=250 commission=4375 ttc=5250",
  "facture 1 2026-09: base=150000 taux=250 commission=3750 ttc=4500",
  "facture 1 2026-08: base=175000 taux=250 commission=4375 ttc=5250",
  "facture 1 2026-07: base=175000 taux=250 commission=4375 ttc=5250",
  "actuelle Groupe Nu: 3:100%:0:0",
  "actuelle Groupe Alpha: 1:100%:250:4375",
  "actuelle Groupe Delta: 1:70%:250:2727 2:30%:250:1169",
  "actuelle Groupe Lambda: 2:100%:250:2625",
  'jauge 1: {"apporteurId":1,"commissionne":true,"place":175000,"pipe":284084,"palier":1,"tauxActuelPdm":250,"tauxPipePdm":250,"manque":225001,"prochainTauxPdm":500,"salles":7,"marge":0}',
  "indicateurs: placeAnnee=52500 venirAnnee=35064 aEmettre=20250 aEncaisser=0",
];

/** Idem : le connecteur RIS et les trois modes d'installation, réglés autrefois dans les paramètres de l'apport. */
const ATTENDU_OFFRES = [
  "Groupe Alpha: recurrent=175000 connecteur=26250 installation=120000",
  "Groupe Delta: recurrent=155834 connecteur=23375 installation=165000",
  "Groupe Lambda: recurrent=105000 connecteur=15750 installation=120000",
  "Groupe Nu: recurrent=54166 connecteur=8125 installation=75000",
  "Groupe Alpha: recurrent=175000 connecteur=26250 installation=120000",
  "Groupe Delta: recurrent=155834 connecteur=23375 installation=120000",
  "Groupe Lambda: recurrent=105000 connecteur=15750 installation=120000",
  "Groupe Nu: recurrent=54166 connecteur=8125 installation=75000",
  "Groupe Alpha: recurrent=175000 connecteur=26250 installation=600000",
  "Groupe Delta: recurrent=155834 connecteur=23375 installation=570000",
  "Groupe Lambda: recurrent=105000 connecteur=15750 installation=360000",
  "Groupe Nu: recurrent=54166 connecteur=8125 installation=150000",
];

describe("non-régression : l'apport d'affaires lit la grille commune (lot S)", () => {
  it("commissions mois par mois et prévisionnel, grille lue depuis les réglages de l'apport : les centimes d'avant", () => {
    expect(empreinte(DEPUIS_REGLAGES)).toEqual(ATTENDU);
  });
  it("commissions mois par mois et prévisionnel, grille lue depuis CrmGrilleTarifaire : mêmes centimes", () => {
    expect(empreinte(DEPUIS_GRILLE)).toEqual(ATTENDU);
  });
  it("connecteur RIS et installation, par site, par groupe et par salle : mêmes centimes", () => {
    expect(empreinteOffres(DEPUIS_REGLAGES)).toEqual(ATTENDU_OFFRES);
    expect(empreinteOffres(DEPUIS_GRILLE)).toEqual(ATTENDU_OFFRES);
  });
});

import { describe, expect, it } from "vitest";
import type { DonneesApports, GroupeDonnees } from "./charger";
import {
  echapper, factureHtml, ficheSignalementHtml, filtrerGroupes, nomFichier, suiviCsv, syntheseCommissionsHtml, syntheseGroupesHtml, texteFacture,
} from "./documents";
import { creerMoteur } from "./calcul";
import { contexteDe } from "./charger";
import { PRIX_EN_BASE } from "./grilleEssai";
import { PARAMETRES_DEFAUT } from "./referentiel";

function groupe(id: number, champs: Partial<GroupeDonnees> = {}): GroupeDonnees {
  return {
    id, apportId: id, nom: `Groupe ${id}`, creeLe: `2026-01-0${id}T00:00:00Z`, etape: "PROSPECT",
    apporteurId: 1, coApporteurId: null, coApporteurPart: 30, offreTalk: true, offreKonnect: true, offreConnecteurRis: false,
    bcEnvoyeLe: null, commandeValideeLe: null, commandeInstalleeLe: null, deploiementPrevuLe: null,
    decision: "attente", decisionLe: null, signaleLe: "2026-10-01",
    denominationSociale: null, siren: null, adresseSiege: null, categorie: "independant", investisseur: null, precisionCategorie: "SELAS",
    origine: "APPORTEUR", besoin: "Accueil saturé", ris: "XPLORE - EDL", risCodeClient: null, risCodesSites: null, risCommercial: null,
    risCommercialTelephone: null, risCommercialEmail: null, perimetre: "sites", observations: null, notes: null,
    contacts: [{ id: 1, nom: "Direction", fonction: "Directeur", telephone: "01 02 03 04 05", email: null }],
    prestataires: [{ id: 1, type: "DSI Groupe", societe: "Informatique SA", nom: null, telephone: null, email: null, commentaire: null }],
    sites: [{ id: id * 10, nom: "Site 1", adresse: "1 rue des Lilas, 33000 Bordeaux", ville: null, ris: null, lie: false,
      offreTalk: false, offreKonnect: false, offreConnecteurRis: false,
      salles: [{ id: 1, libelle: "Salle 1", modalite: "IRM" }, { id: 2, libelle: "Salle 2", modalite: "RX" }] }],
    ...champs,
  };
}

function donnees(groupes: GroupeDonnees[], champs: Partial<DonneesApports> = {}): DonneesApports {
  const apporteur = { id: 1, nom: "Prénom NOM", structure: "Structure apporteuse", telephone: "06 00 00 00 00", email: "contact@example.test",
    adresse: "3 allée des Pins", siret: "123 456 789 00012", rcs: "RCS Exemple", tvaIntracom: null, prefixeFacture: "APP-", mention: null,
    commissionne: true, ordre: 0, groupes: groupes.length, factures: 0 };
  return { parametres: { ...PARAMETRES_DEFAUT, apporteurParDefautId: 1 }, prix: PRIX_EN_BASE, grille: { id: 1, applicableLe: "2026-11-18", manquants: [] }, apporteurs: [apporteur], groupes, factures: [],
    clientsSansApport: [], aujourdhui: "2026-11-06", moisCourant: "2026-11", ...champs };
}

const SANS_TIRET_LONG = /—/;

describe("documents de l'apport d'affaires", () => {
  it("échappe les textes saisis", () => {
    const d = donnees([groupe(1, { nom: "<script>alert(1)</script>" })]);
    const html = syntheseGroupesHtml(d, "tous", { statut: "all", recherche: "" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(echapper(`"a" & 'b'`)).toBe("&quot;a&quot; &amp; &#39;b&#39;");
  });

  it("produit la fiche de signalement avec le SIREN, la décision et les sites", () => {
    const d = donnees([groupe(1, { siren: "910 456 573", decision: "valide", decisionLe: "2026-10-05", denominationSociale: "Imagerie du Sud SELAS" })]);
    const html = ficheSignalementHtml(d, 1);
    expect(html).toContain("910 456 573");
    expect(html).toContain("&#9746;</span> Validé");
    expect(html).toContain("05/10/2027");
    expect(html).toContain("1 × IRM");
    expect(html).toContain("Groupe privé indépendant · SELAS");
    expect(html).toContain("Apporteur d&#39;affaires");
    expect(html).not.toMatch(SANS_TIRET_LONG);
    expect(html).not.toContain("window.print()},300");
    expect(ficheSignalementHtml(d, 1, { imprimer: true })).toContain("window.print()},300");
  });

  it("additionne HT et TVA sur la facture", () => {
    const d = donnees([groupe(1, { commandeInstalleeLe: "2026-08-10" })]);
    const m = creerMoteur(contexteDe(d)), f = m.calculFacture("2026-10", 1);
    expect(f.commissionCentimes).toBe(1750);
    expect(f.ttcCentimes).toBe(f.commissionCentimes + f.tvaCentimes);
    const html = factureHtml(d, 1, "2026-10");
    expect(html).toContain("FACTURE N° APP-2026-10");
    expect(html).toContain("Total TTC");
    expect(html).not.toMatch(SANS_TIRET_LONG);
    expect(texteFacture(d, 1, "2026-10")).toContain("Total TTC : 21,00");
  });

  it("écrit le CSV pour un tableur français", () => {
    const d = donnees([groupe(1, { commandeInstalleeLe: "2026-08-10" })]);
    const csv = suiviCsv(d, "tous");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain('"Groupe 1";"En place";');
    expect(csv).toContain("700,00");
    expect(csv).toContain('"Taux %";"";');
  });

  it("filtre par recherche sans accents et par statut", () => {
    const d = donnees([groupe(1, { nom: "Imagerie Béarn" }), groupe(2, { bcEnvoyeLe: "2026-09-01" })]);
    const m = creerMoteur(contexteDe(d));
    expect(filtrerGroupes(d, m, "tous", { statut: "all", recherche: "bearn" }).affiches.map((g) => g.id)).toEqual([1]);
    expect(filtrerGroupes(d, m, "tous", { statut: "envoyee", recherche: "" }).affiches.map((g) => g.id)).toEqual([2]);
  });

  it("garde la synthèse des commissions sans tiret long et nomme les fichiers", () => {
    const d = donnees([groupe(1, { commandeInstalleeLe: "2026-08-10" })]);
    const html = syntheseCommissionsHtml(d, 1);
    expect(html).toContain("<svg");
    expect(html).not.toMatch(SANS_TIRET_LONG);
    expect(nomFichier.fiche({ denominationSociale: "Imagerie Côte d'Or", nom: "x" }, "2026-11-06")).toBe("Fiche_signalement_Imagerie_Cote_d_Or_2026-11-06.html");
    expect(nomFichier.syntheseGroupes({ statut: "all", recherche: "" }, "2026-11-06")).toBe("Synthese_groupes_LYRAE_tous_2026-11-06.html");
  });
});

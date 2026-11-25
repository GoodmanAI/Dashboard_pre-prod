import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { champDeColonne, dateDepuisCellule, decouperAdresse, depuisTableau, echangeDepuisNature, etapeDepuisStatut, lireFichier, lireLigne, modeleXlsx, typeDepuisMarche } from "./prospects";

const maintenant = new Date("2026-11-25T12:00:00Z");

describe("colonnes du fichier des commerciaux", () => {
  it("reconnaît les en-têtes de Maxime, accents et casse ignorés", () => {
    expect(champDeColonne("Nom du centre")).toBe("nom");
    expect(champDeColonne("Type de marché (public/privé)")).toBe("marche");
    expect(champDeColonne("Contacts précisés (nom, tél)")).toBe("contact");
    expect(champDeColonne("Date du dernier contact (JJ/MM)")).toBe("dernierContact");
    expect(champDeColonne("Type de marché")).toBe("marche");
    expect(champDeColonne("Adresse du centre ou prospect")).toBe("adresse");
    expect(champDeColonne("Site web si précisé")).toBe("siteWeb");
    expect(champDeColonne("Contacts précisés")).toBe("contact");
    expect(champDeColonne("Date du dernier contact")).toBe("dernierContact");
    expect(champDeColonne("Statut du prospect")).toBe("statut");
    expect(champDeColonne("Commentaires/notes terrain")).toBe("notes");
    expect(champDeColonne("Nature du contact")).toBe("nature");
    expect(champDeColonne("RIS")).toBe("ris");
    expect(champDeColonne("Agenda maître")).toBe("agenda");
    expect(champDeColonne("Prestataire téléphonique")).toBe("prestataire");
    expect(champDeColonne("Colonne inconnue")).toBe(null);
  });
  it("trouve l'en-tête sous une ligne de titre et ignore les lignes vides", () => {
    const f = depuisTableau([["Prospects 2026"], ["Nom du centre", "RIS", "Truc"], ["Centre A", "Xplore", "x"], [null, null, null], ["Centre B", null, null]]);
    expect(f.lignes.map((l) => [l.numero, l.valeurs.nom])).toEqual([[3, "Centre A"], [5, "Centre B"]]);
    expect(f.colonnes.filter((c) => !c.champ).map((c) => c.entete)).toEqual(["Truc"]);
  });
  it("refuse un fichier sans colonne de nom", () => {
    expect(() => depuisTableau([["RIS"], ["Xplore"]])).toThrow(/Nom du centre/);
  });
});

describe("valeurs", () => {
  it("marché public ou privé", () => {
    expect(typeDepuisMarche("Public")).toEqual({ type: "HOPITAL", deduit: false });
    expect(typeDepuisMarche("privé")).toEqual({ type: "CABINET", deduit: false });
    expect(typeDepuisMarche("Mixte")).toEqual({ type: "CABINET", deduit: true });
    expect(typeDepuisMarche("Clinique")).toEqual({ type: "CLINIQUE", deduit: false });
    expect(typeDepuisMarche(null).deduit).toBe(true);
  });
  it("statut lu en étape d'avant la signature", () => {
    expect(etapeDepuisStatut("Premiers échanges")).toEqual({ etape: "POURPARLERS", exact: true });
    expect(etapeDepuisStatut("À relancer").etape).toBe("POURPARLERS");
    expect(etapeDepuisStatut("Devis envoyé")).toEqual({ etape: "PROPOSITION", exact: true });
    expect(etapeDepuisStatut("Pas intéressé")).toEqual({ etape: "PROSPECT", exact: false });
    expect(etapeDepuisStatut("Signé")).toEqual({ etape: "PROSPECT", exact: false });
  });
  it("nature du contact", () => {
    expect(echangeDepuisNature("Appel téléphonique")).toBe("APPEL");
    expect(echangeDepuisNature("Salon JFR")).toBe("VISITE");
    expect(echangeDepuisNature("LinkedIn")).toBe("LINKEDIN");
    expect(echangeDepuisNature("Radiologue")).toBe(null);
  });
  it("dates d'Excel et écrites à la main", () => {
    expect(dateDepuisCellule("20/11/2026")).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(dateDepuisCellule("2026-11-20")).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(dateDepuisCellule(46346)).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(dateDepuisCellule("31/02/2026")).toBe("invalide");
    expect(dateDepuisCellule(null)).toBe(null);
  });
  it("adresse découpée au code postal", () => {
    expect(decouperAdresse("12 rue de la Gare, 56300 Pontivy")).toEqual({ adresse: "12 rue de la Gare", codePostal: "56300", ville: "Pontivy" });
    expect(decouperAdresse("Zone artisanale")).toEqual({ adresse: "Zone artisanale", codePostal: null, ville: null });
  });
});

describe("une ligne", () => {
  it("sort le mail et le téléphone d'une cellule de contact", () => {
    const r = lireLigne(2, { nom: "Centre A", contact: "Marie Martin 06 12 34 56 78 marie@centre-a.fr", nature: "Appel", dernierContact: "20/11/2026" }, maintenant);
    if (!("prospect" in r)) throw new Error("refusée");
    expect(r.prospect.contact).toEqual({ nom: "Marie Martin", fonction: null, telephone: "06 12 34 56 78", email: "marie@centre-a.fr" });
    expect(r.prospect.echange).toEqual({ type: "APPEL", le: new Date("2026-11-20T00:00:00Z") });
  });
  it("garde le statut et la nature inconnus dans les notes, et avertit", () => {
    const r = lireLigne(3, { nom: "Centre B", statut: "Froid", notes: "Vu au salon", contact: "Dr Durand", fonction: "Gérant", nature: "Radiologue" }, maintenant);
    if (!("prospect" in r)) throw new Error("refusée");
    expect(r.prospect.notes).toBe("Vu au salon\nStatut dans le fichier : Froid\nNature du contact : Radiologue");
    expect(r.prospect.avertissements.length).toBe(2);
  });
  it("refuse une ligne sans nom, ignore une date future", () => {
    expect(lireLigne(4, { ris: "Xplore" })).toEqual({ refus: "nom du centre vide" });
    const r = lireLigne(5, { nom: "C", dernierContact: "01/01/2027" }, maintenant);
    expect("prospect" in r && r.prospect.echange).toBe(null);
  });
  it("complète un site web sans https", () => {
    const r = lireLigne(6, { nom: "C", siteWeb: "www.centre.fr" }, maintenant);
    expect("prospect" in r && r.prospect.siteWeb).toBe("https://www.centre.fr");
  });
});

describe("fichiers", () => {
  it("le modèle se relit et ses colonnes sont toutes reconnues", () => {
    const f = lireFichier(modeleXlsx(), "modele.xlsx");
    expect(f.colonnes.every((c) => c.champ)).toBe(true);
    expect(f.lignes).toHaveLength(1);
    const r = lireLigne(2, f.lignes[0].valeurs, maintenant);
    expect("prospect" in r && r.prospect.centre?.ville).toBe("Pontivy");
  });
  it("un CSV au point-virgule, en UTF-8 avec BOM", () => {
    const f = lireFichier(Buffer.from("﻿Nom du centre;Ville;RIS\nCentre Été;Vannes;Xplore\n", "utf8"), "p.csv");
    expect(f.lignes[0].valeurs).toEqual({ nom: "Centre Été", ville: "Vannes", ris: "Xplore" });
  });
  it("un .xlsx avec une vraie date Excel", () => {
    const feuille = XLSX.utils.aoa_to_sheet([["Nom du centre", "Date du dernier contact"], ["Centre A", new Date(2026, 10, 20)]], { cellDates: true });
    const c = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(c, feuille, "F");
    const f = lireFichier(XLSX.write(c, { type: "buffer", bookType: "xlsx" }) as Buffer, "a.xlsx");
    expect(dateDepuisCellule(f.lignes[0].valeurs.dernierContact ?? null)).toEqual(new Date("2026-11-20T00:00:00Z"));
  });
});

import { describe, expect, it } from "vitest";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import type { DonneesApports, GroupeDonnees } from "./charger";
import { PRIX_EN_BASE } from "./grilleEssai";
import { exporterSauvegarde, lireSauvegarde, origineLue, PRIX_IGNORES } from "./importer";
import { PARAMETRES_DEFAUT } from "./referentiel";

/** Une sauvegarde telle que la produit le calculateur, réduite à l'essentiel. Noms neutres (C-10). */
const SAUVEGARDE = {
  version: 2,
  params: {
    talk: 325, konnect: 95, tva: 20, edl: 15, instTalk: 750, instKonnect: 450, instMode: "site",
    s1: 4000, s2: 12500, r1: 2.5, r2: 5, r3: 10, existing: 1500.5, offset: 1, duration: 0, horizon: 18,
    fcValidee: true, fcEnvoyee: true, fcProspect: false, tvaFacture: 20, prefix: "ENT-NEU-", payDays: 15,
    apporteurs: [
      { id: "mlo", nom: "Apporteur Un", structure: "STRUCTURE UN", commission: true },
      { id: "bth", nom: "Apporteur Deux", structure: "", commission: true, prefix: "XX-NEU-" },
    ],
    defaultApp: "mlo", provTypes: ["DSI Groupe", "Presta Téléphonie", "DSI Groupe"],
    emNom: "STRUCTURE UN", emRep: "Apporteur Un", emAdresse: "1 rue de l'Exemple, 33000 Bordeaux", emRcs: "RCS Exemple",
    clNom: "Neuracorp AI, SAS", clAdresse: "17 rue de la Marine, 56950 Crach", clRcs: "RCS Lorient 933 852 717",
  },
  groups: [
    {
      id: "g1", name: "Groupe Alpha", created: 2, app: "mlo", coApp: "bth", coShare: 40, talk: true, konnect: true, edl: false,
      gtype: "investisseur", investor: "AUTRE", investorOther: "Fonds Exemple", siren: "910 456 573",
      dSignal: "2026-03-02", decision: "valide", dDecision: "2026-03-05", dEnvoyee: "2026-04-01", dValidee: "2026-05-01",
      dInstallee: "2026-06-15", dPrevue: "2026-13-45", origine: "Réseau personnel", risEd: "Xplore (EDL)",
      contacts: [{ nom: "", fonction: "Directeur", tel: "", email: "" }, { nom: "", fonction: "", tel: "", email: "" }],
      provs: [{ type: "DSI Groupe", soc: "Société Exemple", nom: "", tel: "", email: "", com: "" }],
      sites: [
        { id: "s1", name: "Site principal", loc: "33000 Bordeaux", ris: "AUTRE", risOther: "RIS maison", talk: false, konnect: false, edl: true,
          rooms: [{ id: "r1", mod: "IRM", label: "IRM 1" }, { id: "r2", mod: "CT", label: "Scanner" }, { id: "r3", mod: "XYZ", label: "Inconnue" }] },
        { id: "s2", name: "Site secondaire", loc: "", ris: "", rooms: [{ id: "r4", mod: "ECHO", label: "Écho" }] },
      ],
    },
    { id: "gx", name: "Exemple", example: true, created: 1, sites: [] },
  ],
  invoices: {
    "bth_2026-09": {
      status: "emise", number: "XX-NEU-2026-09", issuedOn: "2026-10-01", dueOn: "2026-10-16", paidOn: "", overrides: { g1: 280.5 },
      frozen: { lines: [{ id: "g1", name: "Groupe Alpha (part 40 %)", rec: 280, base: 280, com: 7, talk: "Oui", konnect: "Oui", ris: "Oui", sites: 2, salles: 3 }],
        rate: 2.5, portfolio: 280, baseTotal: 280, commission: 7, tva: 1.4, ttc: 8.4 },
    },
    "2026-10": { status: "a_emettre", overrides: { g1: 700 } },
  },
};

describe("lecture de la sauvegarde du calculateur", () => {
  const lue = lireSauvegarde(SAUVEGARDE);

  it("reprend les apporteurs et l'identité de facturation de l'apporteur par défaut", () => {
    expect(lue.apporteurs.map((a) => a.cle)).toEqual(["mlo", "bth"]);
    expect(lue.apporteurParDefautCle).toBe("mlo");
    expect(lue.apporteurs[0]).toMatchObject({ nom: "Apporteur Un", structure: "STRUCTURE UN", prefixeFacture: "ENT-NEU-", rcs: "RCS Exemple" });
    expect(lue.apporteurs[1]).toMatchObject({ structure: null, prefixeFacture: "XX-NEU-", commissionne: true });
  });

  it("ignore les prix de la sauvegarde, et le rapport le dit (lot S)", () => {
    for (const cle of ["talkTtcCentimes", "konnectTtcCentimes", "connecteurRisPdm", "installationTalkCentimes", "installationKonnectCentimes", "modeInstallation"]) {
      expect(lue.parametres).not.toHaveProperty(cle);
    }
    expect(lue.avertissements).toContain(PRIX_IGNORES);
    expect(lireSauvegarde({ version: 2, params: { s1: 100 }, groups: [] }).avertissements).not.toContain(PRIX_IGNORES);
  });

  it("convertit les euros en centimes et les pourcentages en points de base", () => {
    expect(lue.parametres).toMatchObject({
      tvaPdm: 2000,
      seuil1Centimes: 400000, seuil2Centimes: 1250000, taux1Pdm: 250, taux3Pdm: 1000, autresClientsCentimes: 150050,
      delaiPaiementJours: 15, typesPrestataires: ["DSI Groupe", "Presta Téléphonie"],
    });
  });

  it("lit un groupe partagé, ses sites et ses salles", () => {
    const g = lue.groupes.find((x) => x.cle === "g1")!;
    expect(g).toMatchObject({ apporteurCle: "mlo", coApporteurCle: "bth", coApporteurPart: 40, categorie: "investisseur",
      investisseur: "Fonds Exemple", ris: "XPLORE - EDL", origine: "RESEAU", decision: "valide", commandeInstalleeLe: "2026-06-15" });
    expect(g.sites).toHaveLength(2);
    expect(g.sites[0]).toMatchObject({ adresse: "33000 Bordeaux", ris: "RIS maison", offreConnecteurRis: true });
    expect(g.sites[0].salles.map((s) => s.modalite)).toEqual(["IRM", "CT"]);
    expect(g.contacts).toEqual([{ nom: "Directeur", fonction: "Directeur", telephone: null, email: null }]);
    expect(g.prestataires).toHaveLength(1);
  });

  it("garde l'exemple pour le compter, et range les groupes par date de création", () => {
    expect(lue.groupes.map((g) => [g.cle, g.exemple])).toEqual([["gx", true], ["g1", false]]);
  });

  it("écarte une date illisible et une modalité inconnue en le disant", () => {
    expect(lue.groupes.find((x) => x.cle === "g1")!.deploiementPrevuLe).toBeNull();
    expect(lue.avertissements.some((a) => a.includes("Date illisible") && a.includes("Groupe Alpha"))).toBe(true);
    expect(lue.avertissements.some((a) => a.includes("modalité inconnue"))).toBe(true);
  });

  it("lit la facture figée d'un second apporteur et l'encaissé du mois suivant", () => {
    const emise = lue.factures.find((f) => f.mois === "2026-09")!;
    expect(emise).toMatchObject({ apporteurCle: "bth", statut: "emise", numero: "XX-NEU-2026-09", emiseLe: "2026-10-01", payeeLe: null,
      encaissements: { g1: 28050 } });
    expect(emise.fige).toMatchObject({ tauxPdm: 250, commissionCentimes: 700, tvaCentimes: 140, ttcCentimes: 840 });
    expect(emise.fige!.lignes[0]).toMatchObject({ groupeCle: "g1", theoriqueCentimes: 28000, connecteur: "Oui", salles: 3 });
    expect(lue.factures.find((f) => f.mois === "2026-10")).toMatchObject({ apporteurCle: "mlo", encaissements: { g1: 70000 }, fige: null });
  });

  it("accepte le texte collé tel quel", () => {
    expect(lireSauvegarde(JSON.stringify(SAUVEGARDE)).groupes).toHaveLength(2);
  });

  it("refuse ce qui n'est pas une sauvegarde, avec une phrase qui dit quoi faire", () => {
    expect(() => lireSauvegarde("pas du json")).toThrow(ErreurMetier);
    expect(() => lireSauvegarde({ autre: 1 })).toThrow(/Collez la sauvegarde/);
    expect(() => lireSauvegarde([1, 2])).toThrow(ErreurMetier);
  });

  it("reprend la liste par défaut du calculateur quand la sauvegarde n'en porte pas", () => {
    const l = lireSauvegarde({ groups: [{ id: "g9", name: "Sans params", app: "inconnu", sites: [] }] });
    expect(l.apporteurParDefautCle).toBe("mlo");
    expect(l.groupes[0].apporteurCle).toBe("mlo");
    expect(l.avertissements.some((a) => a.includes("Apporteur inconnu"))).toBe(true);
  });

  it("ne crée aucun apporteur depuis une sauvegarde vide", () => {
    const l = lireSauvegarde({ version: 2, params: { apporteurs: [] }, groups: [], invoices: {} });
    expect(l.apporteurs).toEqual([]);
    expect(l.avertissements).toEqual([]);
  });

  it("reconnaît les origines évidentes et garde les autres en clair", () => {
    expect(origineLue("Salon, JFR")).toBe("SALON");
    expect(origineLue("Apporteur d'affaires")).toBe("APPORTEUR");
    expect(origineLue("Prospection directe")).toBe("Prospection directe");
    expect(origineLue("")).toBeNull();
  });
});

describe("export au format du calculateur", () => {
  const groupe: GroupeDonnees = {
    id: 45, apportId: 3, nom: "Groupe Beta", creeLe: "2026-02-01T10:00:00.000Z", etape: "PROSPECT",
    apporteurId: 7, coApporteurId: 8, coApporteurPart: 25, offreTalk: true, offreKonnect: false, offreConnecteurRis: true,
    bcEnvoyeLe: "2026-03-01", commandeValideeLe: null, commandeInstalleeLe: null, deploiementPrevuLe: "2027-01-15",
    decision: "valide", decisionLe: "2026-02-10", signaleLe: "2026-02-01",
    denominationSociale: "Groupe Beta SELAS", siren: "910456573", adresseSiege: "2 place Exemple", categorie: "investisseur",
    investisseur: "SIMAGO", precisionCategorie: null, origine: "APPORTEUR", besoin: "Accueil saturé", ris: "Plusieurs RIS",
    risCodeClient: "C12", risCodesSites: "A;B", risCommercial: null, risCommercialTelephone: null, risCommercialEmail: null,
    perimetre: "groupe", observations: null, notes: "Note interne",
    contacts: [{ id: 1, nom: "Direction", fonction: "Directeur", telephone: null, email: null }],
    prestataires: [{ id: 2, type: "DSI Groupe", societe: "Société", nom: null, telephone: null, email: null, commentaire: null }],
    sites: [{ id: 90, nom: "Site A", adresse: null, ville: "Nantes", ris: "XPLORE - EDL", offreTalk: false, offreKonnect: true, offreConnecteurRis: false,
      lie: false, salles: [{ id: 500, libelle: "Salle 1", modalite: "RX" }, { id: 501, libelle: "IRM", modalite: "IRM" }] }],
  };
  const donnees: DonneesApports = {
    parametres: { ...PARAMETRES_DEFAUT, taux1Pdm: 275, autresClientsCentimes: 123456, apporteurParDefautId: 7 },
    prix: PRIX_EN_BASE, grille: { id: 1, applicableLe: "2026-11-18", manquants: [] },
    apporteurs: [
      { id: 7, nom: "Apporteur Un", structure: "STRUCTURE UN", telephone: null, email: null, adresse: "1 rue", siret: null, rcs: "RCS", tvaIntracom: null,
        prefixeFacture: "UN-", mention: "Mention", commissionne: true, ordre: 0, groupes: 1, factures: 0 },
      { id: 8, nom: "Apporteur Deux", structure: null, telephone: null, email: null, adresse: null, siret: null, rcs: null, tvaIntracom: null,
        prefixeFacture: "DEUX-", mention: null, commissionne: true, ordre: 1, groupes: 1, factures: 1 },
    ],
    groupes: [groupe],
    factures: [{ id: 1, apporteurId: 8, mois: "2026-09", statut: "payee", numero: "DEUX-2026-09", emiseLe: "2026-10-01", echeanceLe: "2026-10-16",
      payeeLe: "2026-10-20", encaissements: { "45": 12345 },
      fige: { lignes: [{ organisationId: 45, nom: "Groupe Beta (part 25 %)", theoriqueCentimes: 27083, baseCentimes: 3086, commissionCentimes: 77,
        talk: "Oui", konnect: "Non", connecteur: "Oui", sites: 1, salles: 2 }], tauxPdm: 250, portefeuilleCentimes: 6771,
        baseCentimes: 3086, commissionCentimes: 77, tvaCentimes: 15, ttcCentimes: 92 } }],
    clientsSansApport: [], aujourdhui: "2026-11-06", moisCourant: "2026-11",
  };
  const exporte = exporterSauvegarde(donnees);

  it("produit le format v2 avec les identifiants du calculateur", () => {
    expect(exporte.version).toBe(2);
    expect(exporte.params.defaultApp).toBe("p7");
    expect(exporte.params).toMatchObject({ emNom: "STRUCTURE UN", emRep: "Apporteur Un", prefix: "UN-", r1: 2.75 });
    expect(exporte.groups[0]).toMatchObject({ id: "g45", app: "p7", coApp: "p8", coShare: 25, status: "envoyee", investor: "SIMAGO",
      origine: "Apporteur d'affaires", risEd: "AUTRE", risEdOther: "Plusieurs RIS" });
    expect(exporte.groups[0].sites[0]).toMatchObject({ id: "s90", loc: "Nantes", ris: "XPLORE - EDL", rooms: [{ id: "r500", mod: "RX", label: "Salle 1" }, { id: "r501", mod: "IRM", label: "IRM" }] });
    expect(Object.keys(exporte.invoices)).toEqual(["p8_2026-09"]);
  });

  it("écrit les prix de la grille en vigueur, ramenés en TTC comme avant (lot S)", () => {
    expect(exporte.params).toMatchObject({ talk: 325, konnect: 95, tva: 20, edl: 15, instTalk: 750, instKonnect: 450, instMode: "site" });
  });

  it("se relit sans perdre un centime", () => {
    const relue = lireSauvegarde(JSON.parse(JSON.stringify(exporte)));
    expect(relue.parametres).toMatchObject({ tvaPdm: 2000, taux1Pdm: 275, autresClientsCentimes: 123456, delaiPaiementJours: 15 });
    // Les prix relus ne s'écrivent pas : la sauvegarde réexportée porte à nouveau ceux de la grille, identiques.
    expect(exporterSauvegarde({ ...donnees, parametres: { ...donnees.parametres, ...relue.parametres } }).params).toEqual(exporte.params);
    expect(relue.apporteurParDefautCle).toBe("p7");
    expect(relue.apporteurs[0]).toMatchObject({ nom: "Apporteur Un", structure: "STRUCTURE UN", prefixeFacture: "UN-", mention: "Mention" });
    const g = relue.groupes[0];
    expect(g).toMatchObject({ cle: "g45", apporteurCle: "p7", coApporteurCle: "p8", coApporteurPart: 25, ris: "Plusieurs RIS",
      origine: "APPORTEUR", deploiementPrevuLe: "2027-01-15", perimetre: "groupe", investisseur: "SIMAGO" });
    expect(g.sites[0].salles).toEqual([{ libelle: "Salle 1", modalite: "RX" }, { libelle: "IRM", modalite: "IRM" }]);
    const f = relue.factures[0];
    expect(f).toMatchObject({ apporteurCle: "p8", mois: "2026-09", statut: "payee", payeeLe: "2026-10-20", encaissements: { g45: 12345 } });
    expect(f.fige).toMatchObject({ tauxPdm: 250, baseCentimes: 3086, commissionCentimes: 77, tvaCentimes: 15, ttcCentimes: 92, portefeuilleCentimes: 6771 });
    expect(f.fige!.lignes[0]).toMatchObject({ groupeCle: "g45", theoriqueCentimes: 27083, baseCentimes: 3086 });
    expect(relue.avertissements).toEqual([PRIX_IGNORES]);
  });
});

describe("la version récente du calculateur : adresses en champs séparés (C-89)", () => {
  it("lit le siège et les sites rangés en adresse, code postal et ville, avec SIRET et FINESS", () => {
    const lue = lireSauvegarde({ version: 2, groups: [{ id: "g1", name: "Groupe test", hqAdr: "1 rue A", hqCp: "29000", hqVille: "Quimper",
      sites: [{ id: "s1", name: "Site A", adr: "2 rue B", cp: "29900", ville: "Concarneau", siret: "123 456 789 00011", finess: "290000017", rooms: [] }] }] });
    expect(lue.groupes[0].adresseSiege).toBe("1 rue A, 29000 Quimper");
    expect(lue.groupes[0].sites[0]).toMatchObject({ adresse: "2 rue B", codePostal: "29900", ville: "Concarneau", siret: "12345678900011", finess: "290000017" });
  });
  it("l'ancienne version, en un seul texte, reste lue", () => {
    const lue = lireSauvegarde({ version: 2, groups: [{ id: "g1", name: "Groupe test", hq: "1 rue A 29000 Quimper", sites: [{ id: "s1", name: "Site A", loc: "Quimper", rooms: [] }] }] });
    expect(lue.groupes[0].adresseSiege).toBe("1 rue A 29000 Quimper");
    expect(lue.groupes[0].sites[0].adresse).toBe("Quimper");
  });
});

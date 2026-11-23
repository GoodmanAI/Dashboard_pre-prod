import { describe, expect, it } from "vitest";
import { creationGrille, creationTarif, messageTarif, modificationGrille, modificationTarif, suppressionGrille, suppressionTarif, tarifComplet } from "./tarif";

const MAJ = "2026-11-18T10:00:00.000Z";
const talk = { majLe: MAJ, role: "TALK", libelle: "Talk", productId: 3, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: 27083 };
const ris = { majLe: MAJ, role: "CONNECTEUR_RIS", libelle: "Connecteur RIS", type: "ABONNEMENT", base: "POURCENTAGE", pourMille: 150 };
const autre = { majLe: MAJ, role: "AUTRE", libelle: "Vente de RIS", type: "PRESTATION", base: "PAR_ORGANISATION", montantHtCentimes: 120000 };

describe("créer une grille", () => {
  it("accepte un jour, des notes et une grille à copier", () => {
    const r = creationGrille.parse({ applicableLe: "2027-01-01", notes: "  Hausse de janvier ", copierDe: 4 });
    expect(r.applicableLe).toEqual(new Date("2027-01-01T00:00:00Z"));
    expect(r).toMatchObject({ notes: "Hausse de janvier", copierDe: 4 });
  });
  it("une grille vide : la date suffit", () => expect(creationGrille.safeParse({ applicableLe: "2027-01-01" }).success).toBe(true));
  it.each(["2027-01-01T10:00:00Z", "2027-02-30", "01/01/2027", "", "2027-1-1", "1999-12-31", "2101-01-01"])("refuse la date %j : seul un jour AAAA-MM-JJ passe", (applicableLe) => {
    expect(creationGrille.safeParse({ applicableLe }).success).toBe(false);
  });
  it("refuse une date absente, un champ inconnu et une copie décimale", () => {
    expect(creationGrille.safeParse({}).success).toBe(false);
    expect(creationGrille.safeParse({ applicableLe: "2027-01-01", prix: 1 }).success).toBe(false);
    expect(creationGrille.safeParse({ applicableLe: "2027-01-01", copierDe: 1.5 }).success).toBe(false);
  });
  it("refuse des notes de plus de 2 000 caractères", () => expect(creationGrille.safeParse({ applicableLe: "2027-01-01", notes: "a".repeat(2001) }).success).toBe(false));
});

describe("modifier une grille", () => {
  it("demande la version lue et au moins un champ", () => {
    expect(modificationGrille.safeParse({ notes: "x" }).success).toBe(false);
    expect(modificationGrille.safeParse({ majLe: MAJ }).success).toBe(false);
    expect(modificationGrille.safeParse({ majLe: MAJ, notes: null }).success).toBe(true);
    expect(modificationGrille.safeParse({ majLe: MAJ, applicableLe: "2027-02-01" }).success).toBe(true);
  });
  it("refuse une date illisible et un champ inconnu", () => {
    expect(modificationGrille.safeParse({ majLe: MAJ, applicableLe: "demain" }).success).toBe(false);
    expect(modificationGrille.safeParse({ majLe: MAJ, notes: "x", creeLe: MAJ }).success).toBe(false);
  });
});

describe("un tarif : montants entiers, une base, un rôle qui fixe le code", () => {
  it("accepte un tarif par salle et un pourcentage", () => {
    expect(creationTarif.safeParse(talk).success).toBe(true);
    expect(creationTarif.safeParse(ris).success).toBe(true);
  });
  it("un prix peut manquer (« Prix à renseigner »), jamais être inventé", () => {
    expect(creationTarif.safeParse({ ...talk, montantHtCentimes: null }).success).toBe(true);
    const { montantHtCentimes, ...sans } = talk; void montantHtCentimes;
    expect(creationTarif.safeParse(sans).success).toBe(true);
  });
  it("un tarif s'ajoute par son rôle, jamais par un code saisi", () => {
    expect(creationTarif.safeParse(autre).success).toBe(true);
    for (const role of ["", "talk", "VENTE_DE_RIS", "TARIF_1", null]) expect(creationTarif.safeParse({ ...talk, role }).success).toBe(false);
    const { role, ...sansRole } = talk; void role;
    expect(creationTarif.safeParse(sansRole).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, code: "TALK" }).success).toBe(false);
  });
  it("le rôle contraint le type et la base", () => {
    expect(creationTarif.safeParse({ ...talk, type: "PRESTATION" }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, base: "PAR_SITE" }).success).toBe(true);
    expect(creationTarif.safeParse({ ...ris, base: "PAR_SALLE", pourMille: null, montantHtCentimes: 100 }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, role: "INSTALLATION_TALK" }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, role: "INSTALLATION_TALK", type: "MISE_EN_SERVICE" }).success).toBe(true);
  });
  it("refuse un libellé vide ou trop long", () => {
    for (const libelle of ["", "   ", "a".repeat(121)]) expect(creationTarif.safeParse({ ...talk, libelle }).success).toBe(false);
  });
  it.each([-1, 1.5, 100000001, "270"])("refuse le montant %j", (montantHtCentimes) => expect(creationTarif.safeParse({ ...talk, montantHtCentimes }).success).toBe(false));
  it("une base en pourcentage veut un taux en pour-mille et aucun montant", () => {
    expect(creationTarif.safeParse({ ...ris, pourMille: undefined }).success).toBe(false);
    expect(creationTarif.safeParse({ ...ris, pourMille: null }).success).toBe(false);
    expect(creationTarif.safeParse({ ...ris, montantHtCentimes: 100 }).success).toBe(false);
    for (const pourMille of [-1, 1001, 15.5]) expect(creationTarif.safeParse({ ...ris, pourMille }).success).toBe(false);
    expect(creationTarif.safeParse({ ...ris, pourMille: 0 }).success).toBe(true);
    expect(creationTarif.safeParse({ ...ris, pourMille: 1000 }).success).toBe(true);
  });
  it("une autre base n'a pas de taux", () => {
    expect(creationTarif.safeParse({ ...talk, pourMille: 150 }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, pourMille: null }).success).toBe(true);
  });
  it("la part à l'usage n'a pas de tarif de grille : elle se chiffre sur la proposition", () => {
    expect(creationTarif.safeParse({ ...autre, type: "PART_VARIABLE" }).success).toBe(false);
    for (const type of ["ABONNEMENT", "MISE_EN_SERVICE", "PRESTATION"]) expect(creationTarif.safeParse({ ...autre, type }).success).toBe(true);
  });
  it("le produit est facultatif (connecteur RIS), l'ordre borné", () => {
    expect(creationTarif.safeParse({ ...talk, productId: null }).success).toBe(true);
    expect(creationTarif.safeParse({ ...talk, productId: 0 }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, ordre: 10 }).success).toBe(true);
    for (const ordre of [-1, 10001, 2.5]) expect(creationTarif.safeParse({ ...talk, ordre }).success).toBe(false);
  });
  it("demande la version lue de la grille", () => {
    const { majLe, ...sans } = talk; void majLe;
    expect(creationTarif.safeParse(sans).success).toBe(false);
  });
  it("refuse un champ inconnu : une ligne de proposition ne passe pas pour un tarif", () => {
    expect(creationTarif.safeParse({ ...talk, offerte: true }).success).toBe(false);
    expect(creationTarif.safeParse({ ...talk, grilleId: 2 }).success).toBe(false);
  });
});

describe("modifier un tarif", () => {
  it("le code et le rôle sont stables : ils ne changent pas", () => {
    expect(modificationTarif.safeParse({ majLe: MAJ, code: "AUTRE" }).success).toBe(false);
    expect(modificationTarif.safeParse({ majLe: MAJ, role: "KONNECT" }).success).toBe(false);
  });
  it("demande la version lue et au moins un champ", () => {
    expect(modificationTarif.safeParse({ montantHtCentimes: 100 }).success).toBe(false);
    expect(modificationTarif.safeParse({ majLe: MAJ }).success).toBe(false);
    expect(modificationTarif.safeParse({ majLe: MAJ, montantHtCentimes: 30000 }).success).toBe(true);
    expect(modificationTarif.safeParse({ majLe: MAJ, montantHtCentimes: null }).success).toBe(true);
  });
  it("valide chaque champ seul, la cohérence se juge sur le tarif entier", () => {
    expect(modificationTarif.safeParse({ majLe: MAJ, montantHtCentimes: -5 }).success).toBe(false);
    expect(modificationTarif.safeParse({ majLe: MAJ, base: "POURCENTAGE" }).success).toBe(true);
    const { majLe, role, ...reste } = autre; void majLe; void role;
    const courant = { ...reste, code: "TARIF_1" };
    expect(tarifComplet.safeParse({ ...courant, base: "POURCENTAGE" }).success).toBe(false);
    expect(tarifComplet.safeParse({ ...courant, base: "POURCENTAGE", montantHtCentimes: null, pourMille: 150 }).success).toBe(true);
  });
  it("le tarif entier respecte le rôle de son code", () => {
    const talkEnBase = { code: "TALK", libelle: "Talk", productId: 3, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: 27083, pourMille: null };
    expect(tarifComplet.safeParse(talkEnBase).success).toBe(true);
    const r = tarifComplet.safeParse({ ...talkEnBase, type: "PRESTATION" });
    if (r.success) throw new Error("accepté");
    expect(messageTarif(r.error)).toBe("Un tarif « Abonnement Talk » est de type « Abonnement ».");
    // Un ancien code tiré d'un libellé reste une autre prestation : tout type lui va.
    expect(tarifComplet.safeParse({ ...talkEnBase, code: "VENTE_DE_RIS", type: "PRESTATION" }).success).toBe(true);
  });
});

describe("supprimer un tarif ou une grille", () => {
  it("demande la version lue", () => {
    expect(suppressionTarif.safeParse({}).success).toBe(false);
    expect(suppressionTarif.safeParse({ majLe: MAJ }).success).toBe(true);
    expect(suppressionGrille.safeParse({}).success).toBe(false);
    expect(suppressionGrille.safeParse({ majLe: MAJ, force: true }).success).toBe(false);
    expect(suppressionGrille.safeParse({ majLe: MAJ }).success).toBe(true);
  });
});

describe("le refus affiché", () => {
  const refus = (corps: unknown) => { const r = creationTarif.safeParse(corps); if (r.success) throw new Error("accepté"); return messageTarif(r.error); };
  it("dit la règle quand elle parle d'elle-même", () => {
    expect(refus({ ...ris, montantHtCentimes: 100 })).toBe("Un pourcentage n'a pas de montant : indiquez seulement le taux.");
    expect(refus({ ...talk, pourMille: 150 })).toBe("Le taux est réservé à la base en pourcentage.");
    expect(refus({ ...ris, pourMille: null })).toBe("Indiquez le taux du pourcentage, en pour-mille (150 pour 15 %).");
    expect(refus({ ...talk, type: "MISE_EN_SERVICE" })).toBe("Un tarif « Abonnement Talk » est de type « Abonnement ».");
    expect(refus({ ...ris, base: "PAR_SITE", pourMille: null, montantHtCentimes: 100 })).toBe("Un tarif « Connecteur RIS » est un pourcentage du montant des salles.");
  });
  it("sinon nomme le champ à corriger", () => {
    expect(refus({ ...talk, libelle: "" })).toBe("Vérifiez le champ « Libellé ».");
    expect(refus({ ...talk, montantHtCentimes: -1 })).toBe("Vérifiez le champ « Prix hors taxe en euros ».");
    expect(refus({ ...talk, type: "PART_VARIABLE" })).toBe("Vérifiez le champ « Type ».");
    expect(refus({ ...talk, role: "x y" })).toBe("Vérifiez le champ « Rôle ».");
  });
  it("une date de grille illisible se dit aussi", () => {
    const r = creationGrille.safeParse({ applicableLe: "2027-02-30" });
    if (r.success) throw new Error("accepté");
    expect(messageTarif(r.error)).toBe("Date invalide.");
  });
});

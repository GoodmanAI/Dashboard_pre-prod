import { describe, expect, it } from "vitest";
import { contenuProposition, creationVersion, ligneProposition, modificationProposition, acceptationProposition, preremplissageVersion } from "./proposition";
import { messageValidation } from "./messages";
import { saisieEchange } from "./echange";
import { exiger, peutModifierLesMontants } from "../autorisations";
const ligne = { productId: 1, type: "ABONNEMENT", montantCentimes: 333 };
describe("validation des propositions", () => {
  it("valide produit, centre facultatif et centimes entiers", () => {
    expect(ligneProposition.safeParse(ligne).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, centreId: 2 }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, centreId: null }).success).toBe(true);
  });
  it.each([{ montantCentimes: 1.5 }, { montantCentimes: -1 }, { montantCentimes: 100000001 }, { centreId: 1.2 }, { centreId: 0 }, { centreId: "1" }, { productId: 0 }, { unite: "APPEL_TRAITE" }, { volumeInclus: 0 }])(
    "refuse une ligne incohérente", (champs) => expect(ligneProposition.safeParse({ ...ligne, ...champs }).success).toBe(false));
  it("exige l'unité variable et un volume entier positif ou nul", () => {
    const variable = { ...ligne, type: "PART_VARIABLE" };
    expect(ligneProposition.safeParse(variable).success).toBe(false);
    expect(ligneProposition.safeParse({ ...variable, unite: "APPEL_TRAITE", volumeInclus: 0 }).success).toBe(true);
    for (const volumeInclus of [-1, 0.5, 2147483648]) expect(ligneProposition.safeParse({ ...variable, unite: "APPEL_TRAITE", volumeInclus }).success).toBe(false);
  });
  it.each(["http://exemple.test", "javascript:alert(1)", "ftp://exemple.test", "https://"])("refuse le document %s", (documentUrl) => {
    expect(modificationProposition.safeParse({ operation: "modifier", documentUrl }).success).toBe(false);
  });
  it("autorise un lien https et les dates facultatives", () => {
    expect(modificationProposition.safeParse({ operation: "modifier", documentUrl: "https://exemple.test/devis", valideJusquAu: null }).success).toBe(true);
    expect(acceptationProposition.parse({ debuteLe: "2026-11-01" }).debuteLe).toEqual(new Date("2026-11-01"));
  });
  it.each([{ remisePourMille: 12.5 }, { remisePourMille: 1001 }, { engagementMois: 121 }, { preavisMois: -1 }, { engagementMois: 0.5 }])(
    "refuse une remise ou durée invalide", (p) => expect(modificationProposition.safeParse({ operation: "modifier", ...p }).success).toBe(false));
  it("accepte une ligne sans produit qui a un libellé (lot S)", () => {
    const { productId, ...sansProduit } = ligne; void productId;
    expect(ligneProposition.safeParse({ ...sansProduit, libelle: "Connecteur RIS" }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, productId: null, libelle: "Mission ponctuelle", type: "PRESTATION" }).success).toBe(true);
  });
  it.each([undefined, null, "", "   "])("refuse une ligne sans produit au libellé %j", (libelle) => {
    const resultat = ligneProposition.safeParse({ ...ligne, productId: null, libelle });
    expect(resultat.success).toBe(false);
    if (!resultat.success) expect(messageValidation(resultat.error)).toContain("Libellé");
  });
  it("garde le libellé facultatif avec un produit", () => {
    expect(ligneProposition.safeParse({ ...ligne, libelle: "  " }).success).toBe(true);
  });
  it("accepte la case offerte : la ligne garde son montant brut, c'est le geste affiché (lot S)", () => {
    expect(ligneProposition.parse({ ...ligne, offerte: true }).montantCentimes).toBe(333);
    expect(ligneProposition.safeParse({ ...ligne, offerte: false }).success).toBe(true);
    expect(ligneProposition.safeParse({ type: "MISE_EN_SERVICE", productId: 1, montantCentimes: 62500, offerte: true }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, productId: null, libelle: "Salle offerte", offerte: true }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, type: "PART_VARIABLE", unite: "RDV_PRIS", offerte: true }).success).toBe(true);
  });
  it.each(["oui", 1, null, "true"])("refuse offerte = %j : un booléen, rien d'autre", (offerte) => {
    expect(ligneProposition.safeParse({ ...ligne, offerte }).success).toBe(false);
  });
  it("accepte une ligne offerte à 0 : un geste sans valeur affichée, « Formation incluse »", () => {
    expect(ligneProposition.safeParse({ ...ligne, montantCentimes: 0, offerte: true }).success).toBe(true);
    expect(ligneProposition.safeParse({ productId: null, type: "PRESTATION", montantCentimes: 0, libelle: "Formation incluse", offerte: true }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, montantCentimes: 0, offerte: false }).success).toBe(true);
    expect(ligneProposition.safeParse({ ...ligne, montantCentimes: 0 }).success).toBe(true);
  });
  it("des lignes ne partent jamais sans la version lue (lot S)", () => {
    const majLe = "2026-11-18T10:00:00.000Z";
    const sans = modificationProposition.safeParse({ operation: "modifier", lignes: [ligne] });
    expect(sans.success).toBe(false);
    if (!sans.success) expect(messageValidation(sans.error)).toBe("Vérifiez le champ « Version lue ».");
    expect(modificationProposition.safeParse({ operation: "modifier", lignes: [], majLe: undefined }).success).toBe(false);
    expect(modificationProposition.safeParse({ operation: "modifier", lignes: [ligne], majLe }).success).toBe(true);
    expect(modificationProposition.safeParse({ operation: "modifier", lignes: [ligne], majLe: "hier" }).success).toBe(false);
    // Sans lignes, la version lue reste facultative : notes, réponse, lien.
    expect(modificationProposition.safeParse({ operation: "modifier", notes: "Relance" }).success).toBe(true);
    expect(modificationProposition.safeParse({ operation: "statut", vers: "REFUSEE" }).success).toBe(true);
    expect(contenuProposition.safeParse({ lignes: [ligne] }).success).toBe(false);
    expect(contenuProposition.safeParse({ lignes: [ligne], majLe }).success).toBe(true);
  });
  it("accepte une prestation hors catalogue, jamais avec l'unité ou le volume de la part à l'usage", () => {
    const vente = { productId: null, type: "PRESTATION", montantCentimes: 120000, libelle: "Vente de RIS" };
    expect(ligneProposition.safeParse(vente).success).toBe(true);
    expect(ligneProposition.safeParse({ ...vente, unite: "APPEL_TRAITE" }).success).toBe(false);
    expect(ligneProposition.safeParse({ ...vente, volumeInclus: 10 }).success).toBe(false);
    expect(ligneProposition.safeParse({ ...vente, libelle: undefined }).success).toBe(false);
  });
  it("une version se crée vide ou préremplie depuis la grille, et rien d'autre ne passe", () => {
    expect(creationVersion.parse({ organisationId: 3 })).toEqual({ organisationId: 3 });
    expect(creationVersion.parse({ organisationId: 3, preremplir: true })).toEqual({ organisationId: 3, preremplir: true });
    for (const corps of [{ organisationId: 3, preremplir: "oui" }, { organisationId: 3, preremplir: 1 }, { organisationId: 3, grilleId: 1 }, { preremplir: true }]) {
      expect(creationVersion.safeParse(corps).success).toBe(false);
    }
  });
  it("repréremplir un brouillon demande la version lue, rien d'autre", () => {
    expect(preremplissageVersion.safeParse({ majLe: "2026-11-18T10:00:00.000Z" }).success).toBe(true);
    for (const corps of [{}, { majLe: "hier" }, { majLe: "2026-11-18T10:00:00.000Z", grilleId: 2 }, null]) {
      expect(preremplissageVersion.safeParse(corps).success).toBe(false);
    }
  });
  it("la grille d'une version ne se change pas par la modification", () => {
    expect(modificationProposition.safeParse({ operation: "modifier", grilleId: 2 }).success).toBe(false);
  });
  it("nomme le champ de la ligne en erreur", () => {
    const resultat = modificationProposition.safeParse({ operation: "modifier", lignes: [{ ...ligne, montantCentimes: 1.5 }] });
    if (resultat.success) throw new Error("La ligne aurait dû être refusée.");
    expect(messageValidation(resultat.error)).toContain("Montant en euros");
  });
  it("refuse un rôle sans montants", () => {
    expect(peutModifierLesMontants({ role: "CLIENT", droits: ["MODIFIER_MONTANTS"] })).toBe(false);
    expect(() => exiger(peutModifierLesMontants({ role: "ADMIN", droits: [] }))).toThrow();
  });
});
describe("responsable des jalons", () => {
  const jalon = { organisationId: 1, type: "JALON", statut: "PLANIFIE", surveneuLe: "2026-11-01", compteRendu: "Validation" };
  it.each([undefined, null, "EDL", "OPERATEUR_TELEPHONIE", "PRESTATAIRE_SITE_WEB", "AUTRE"])("refuse %s", (aLaChargeDe) => expect(saisieEchange.safeParse({ ...jalon, aLaChargeDe }).success).toBe(false));
  it.each(["LYRAE", "CLIENT"])("accepte %s", (aLaChargeDe) => expect(saisieEchange.safeParse({ ...jalon, aLaChargeDe }).success).toBe(true));
  it("interdit le responsable hors jalon et le jalon sans libellé", () => {
    expect(saisieEchange.safeParse({ ...jalon, type: "APPEL", aLaChargeDe: "CLIENT" }).success).toBe(false);
    expect(saisieEchange.safeParse({ ...jalon, aLaChargeDe: "CLIENT", compteRendu: "" }).success).toBe(false);
  });
});

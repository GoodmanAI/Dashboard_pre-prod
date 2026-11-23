import { describe, expect, it } from "vitest";
import {
  PRODUIT_NON_RELIE, ROLES, ROLES_TARIF, avertissementProduit, codeJournal, codePourRole, estCodeOpaque, estRoleProduit, messageRoleDejaPris, refusProduit, refusRole, roleDuCode, rolesDisponibles,
} from "./roles";

describe("rôle d'un tarif : le rôle fixe le code (lot S)", () => {
  it("un rôle de référence donne son code, celui que lisent le préremplissage et l'apport", () => {
    for (const role of ["TALK", "KONNECT", "DESK", "NOSHOW", "CONNECTEUR_RIS", "INSTALLATION_TALK", "INSTALLATION_KONNECT"] as const) {
      expect(codePourRole(role, [])).toBe(role);
      expect(roleDuCode(role)).toBe(role);
    }
  });
  it("une autre prestation reçoit un code opaque, le suivant dans la grille, jamais tiré du libellé", () => {
    expect(codePourRole("AUTRE", [])).toBe("TARIF_1");
    expect(codePourRole("AUTRE", ["TALK", "TARIF_1", "TARIF_3"])).toBe("TARIF_4");
    // Un ancien code tiré d'un libellé ne compte pas.
    expect(codePourRole("AUTRE", ["VENTE_DE_RIS", "TARIF_X", "TARIF_0"])).toBe("TARIF_1");
  });
  it("un code qui n'est pas de référence est une autre prestation", () => {
    expect(roleDuCode("TARIF_2")).toBe("AUTRE");
    expect(roleDuCode("VENTE_DE_RIS")).toBe("AUTRE");
    expect(roleDuCode("AUTRE")).toBe("AUTRE");
  });
  it("un code opaque est TARIF_ suivi d'un entier positif", () => {
    expect(estCodeOpaque("TARIF_12")).toBe(true);
    for (const c of ["TARIF_0", "TARIF_", "TARIF_01", "TARIF_A", "TARIF_LIBELLE"]) expect(estCodeOpaque(c)).toBe(false);
  });
});

describe("codeJournal : aucun texte saisi au journal (C-27)", () => {
  it("garde un code de référence ou un code opaque", () => {
    expect(codeJournal("TALK")).toBe("TALK");
    expect(codeJournal("TARIF_7")).toBe("TARIF_7");
  });
  it("écarte un code tiré d'un libellé, même en capitales", () => {
    expect(codeJournal("LIBELLE_PRIVE_S")).toBeUndefined();
    expect(codeJournal("VENTE_DE_RIS")).toBeUndefined();
    expect(codeJournal("TARIF_VENTE")).toBeUndefined();
  });
});

describe("rôles disponibles : un rôle de référence une seule fois par grille", () => {
  it("un rôle pris ne se propose plus, une autre prestation toujours", () => {
    expect(rolesDisponibles([])).toEqual([...ROLES_TARIF]);
    expect(rolesDisponibles(["TALK", "CONNECTEUR_RIS", "TARIF_1"])).toEqual(["KONNECT", "DESK", "NOSHOW", "INSTALLATION_TALK", "INSTALLATION_KONNECT", "FORMATION_POC", "AUTRE"]);
    expect(rolesDisponibles(ROLES_TARIF.filter((r) => r !== "AUTRE"))).toEqual(["AUTRE"]);
  });
  it("le refus d'un rôle pris dit quoi faire", () => {
    expect(messageRoleDejaPris("TALK")).toBe("Cette grille a déjà un tarif « Abonnement Talk ». Modifiez-le plutôt que d'en ajouter un second.");
  });
});

describe("refusRole : le rôle contraint le type et la base", () => {
  it("formation du POC : une prestation par dossier, sans quantité par site ou salle", () => {
    expect(refusRole("FORMATION_POC", { type: "PRESTATION", base: "PAR_ORGANISATION" })).toBeNull();
    expect(refusRole("FORMATION_POC", { type: "ABONNEMENT", base: "PAR_ORGANISATION" })?.champ).toBe("type");
    expect(refusRole("FORMATION_POC", { type: "PRESTATION", base: "PAR_SALLE" })?.champ).toBe("base");
  });
  it("un abonnement de produit est un abonnement, par salle, par site ou par organisation", () => {
    expect(refusRole("TALK", { type: "ABONNEMENT", base: "PAR_SALLE" })).toBeNull();
    expect(refusRole("NOSHOW", { type: "ABONNEMENT", base: "PAR_ORGANISATION" })).toBeNull();
    expect(refusRole("TALK", { type: "PRESTATION", base: "PAR_SALLE" })).toEqual({ champ: "type", message: "Un tarif « Abonnement Talk » est de type « Abonnement »." });
    expect(refusRole("KONNECT", { type: "ABONNEMENT", base: "POURCENTAGE" })?.champ).toBe("base");
  });
  it("le connecteur RIS est un pourcentage", () => {
    expect(refusRole("CONNECTEUR_RIS", { type: "ABONNEMENT", base: "POURCENTAGE" })).toBeNull();
    expect(refusRole("CONNECTEUR_RIS", { type: "ABONNEMENT", base: "PAR_SALLE" })).toEqual({ champ: "base", message: "Un tarif « Connecteur RIS » est un pourcentage du montant des salles." });
  });
  it("une installation se facture une fois", () => {
    expect(refusRole("INSTALLATION_TALK", { type: "MISE_EN_SERVICE", base: "PAR_SITE" })).toBeNull();
    expect(refusRole("INSTALLATION_KONNECT", { type: "ABONNEMENT", base: "PAR_SITE" })).toEqual({ champ: "type", message: "Un tarif « Installation Konnect » est de type « Frais d'installation »." });
  });
  it("une autre prestation accepte tout type de tarif et toute base", () => {
    for (const type of ["PRESTATION", "MISE_EN_SERVICE", "ABONNEMENT"] as const) for (const base of ["PAR_SALLE", "PAR_SITE", "PAR_ORGANISATION", "POURCENTAGE"] as const) {
      expect(refusRole("AUTRE", { type, base })).toBeNull();
    }
  });
});

describe("rôles et produits", () => {
  it("les rôles de produit se relient aux produits du catalogue, le connecteur et l'autre prestation non", () => {
    expect(ROLES.TALK.produit).toBe("LyraeTalk");
    expect(ROLES.INSTALLATION_KONNECT.produit).toBe("Konnect");
    expect(ROLES.NOSHOW.produit).toBe("NoShow");
    expect(estRoleProduit("DESK")).toBe(true);
    expect(estRoleProduit("CONNECTEUR_RIS")).toBe(false);
    expect(estRoleProduit("AUTRE")).toBe(false);
  });
  it("chaque phrase est courte, sans tiret cadratin", () => {
    for (const r of ROLES_TARIF) expect(`${ROLES[r].libelle} ${ROLES[r].nom} ${messageRoleDejaPris(r)}`).not.toMatch(/—/);
    expect(PRODUIT_NON_RELIE).not.toMatch(/—/);
  });
});

describe("le rôle fixe aussi le produit relié (lot S, second tour)", () => {
  it("un rôle de produit accepte son produit ou aucun, jamais un autre", () => {
    expect(refusProduit("TALK", "LyraeTalk")).toBeNull();
    expect(refusProduit("TALK", null)).toBeNull();
    expect(refusProduit("INSTALLATION_KONNECT", "Konnect")).toBeNull();
    expect(refusProduit("TALK", "Konnect")).toBe("Un tarif « Abonnement Talk » se relie au produit LyraeTalk, ou à aucun produit.");
    expect(refusProduit("INSTALLATION_TALK", "Konnect")).toBe("Un tarif « Installation Talk » se relie au produit LyraeTalk, ou à aucun produit.");
    expect(refusProduit("DESK", "NoShow")).toMatch(/au produit Desk/);
  });
  it("un rôle sans produit reste libre : autre prestation, connecteur RIS", () => {
    expect(refusProduit("AUTRE", "LyraeTalk")).toBeNull();
    expect(refusProduit("AUTRE", "Konnect")).toBeNull();
    expect(refusProduit("CONNECTEUR_RIS", "LyraeTalk")).toBeNull();
  });
  it("la page avertit d'un produit absent ou d'un mauvais produit hérité, et seulement pour un rôle de produit", () => {
    expect(avertissementProduit("TALK", null)).toBe(PRODUIT_NON_RELIE);
    expect(avertissementProduit("TALK", "LyraeTalk")).toBeNull();
    expect(avertissementProduit("TALK", "Konnect")).toBe("Relié à Konnect, qui n'est pas le produit de ce rôle. Un tarif « Abonnement Talk » se relie au produit LyraeTalk, ou à aucun produit.");
    expect(avertissementProduit("AUTRE", null)).toBeNull();
    expect(avertissementProduit("CONNECTEUR_RIS", "Konnect")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { CHECKLIST } from "@/pilot/lib/checklist/definition";
import { etapeSuggeree, etapesDeclarables, etapesParDefaut, grouperComptes, repartirEtapes, resumeReprise, type EtatAcces, type LigneAcces } from "./regles";

const ligne = (l: Partial<LigneAcces> & Pick<LigneAcces, "userProductId" | "userId">): LigneAcces => ({
  productId: 1, produit: "LyraeTalk", email: `compte${l.userId}@exemple.test`, nom: null,
  organisationId: null, organisationNom: null, ecarteRaison: null, ecarteLe: null, ...l,
});

describe("grouperComptes", () => {
  const etats = new Map<number, EtatAcces>([
    [1, { statutCentre: "EN_INTEGRATION", dernierAppelLe: null }],
    [2, { statutCentre: "EN_INTEGRATION", dernierAppelLe: new Date("2026-11-05T10:00:00Z") }],
    [3, { statutCentre: "EN_PRODUCTION", dernierAppelLe: new Date("2026-11-01T10:00:00Z") }],
    [4, { statutCentre: "EN_INTEGRATION", dernierAppelLe: null }],
  ]);

  it("met un compte par ligne, ses accès dessous, triés par produit", () => {
    const comptes = grouperComptes([
      ligne({ userProductId: 1, userId: 10, produit: "LyraeTalk", productId: 1, nom: "Cabinet A" }),
      ligne({ userProductId: 4, userId: 10, produit: "Konnect", productId: 2, nom: "Cabinet A" }),
    ], etats);
    expect(comptes).toHaveLength(1);
    expect(comptes[0].acces.map((a) => a.produit)).toEqual(["Konnect", "LyraeTalk"]);
    expect(comptes[0].acces[1]).toMatchObject({ statutCentre: "EN_INTEGRATION", dernierAppelLe: null });
  });

  it("place les comptes en service d'abord, puis le plus récemment appelé, puis l'ordre alphabétique", () => {
    const comptes = grouperComptes([
      ligne({ userProductId: 1, userId: 1, nom: "Alpha sans appel" }),
      ligne({ userProductId: 2, userId: 2, nom: "Zêta appelé hier" }),
      ligne({ userProductId: 3, userId: 3, nom: "Mu en service" }),
      ligne({ userProductId: 5, userId: 5, nom: "Bêta inconnu du registre" }),
    ], etats);
    expect(comptes.map((c) => c.nom)).toEqual(["Mu en service", "Zêta appelé hier", "Alpha sans appel", "Bêta inconnu du registre"]);
    expect(comptes[3].acces[0]).toMatchObject({ statutCentre: null, dernierAppelLe: null });
  });

  it("garde le client relié et l'écart du compte", () => {
    const le = new Date("2026-11-02T00:00:00Z");
    const [relie, ecarte] = grouperComptes([
      ligne({ userProductId: 1, userId: 1, nom: "A", organisationId: 7, organisationNom: "Groupe A" }),
      ligne({ userProductId: 4, userId: 2, nom: "B", ecarteRaison: "Compte de démonstration", ecarteLe: le }),
    ], etats);
    expect(relie.organisation).toEqual({ id: 7, nom: "Groupe A" });
    expect(relie.ecarte).toBeNull();
    expect(ecarte.ecarte).toEqual({ raison: "Compte de démonstration", le });
  });
});

describe("etapeSuggeree", () => {
  it("propose En service dès qu'un accès l'est au Dashboard", () => {
    expect(etapeSuggeree([{ statutCentre: "EN_INTEGRATION" }, { statutCentre: "EN_PRODUCTION" }])).toBe("EN_PRODUCTION");
  });
  it("propose Mise en service sinon, y compris sans statut connu", () => {
    expect(etapeSuggeree([{ statutCentre: "EN_INTEGRATION" }, { statutCentre: null }])).toBe("EN_INTEGRATION");
    expect(etapeSuggeree([])).toBe("EN_INTEGRATION");
  });
});

describe("etapesDeclarables", () => {
  it("ne propose jamais une étape automatique", () => {
    const automatiques = CHECKLIST.filter((e) => e.mode === "AUTOMATIQUE").map((e) => e.cle);
    expect(automatiques.length).toBeGreaterThan(0);
    for (const produits of [["LyraeTalk"], ["Konnect"], ["Desk"], ["LyraeTalk", "Konnect"]]) {
      expect(etapesDeclarables(produits).some((e) => automatiques.includes(e.cle))).toBe(false);
    }
  });
  it("suit les produits : la ligne téléphonique pour Talk, le site web pour Konnect", () => {
    const talk = etapesDeclarables(["LyraeTalk"]).map((e) => e.cle);
    const konnect = etapesDeclarables(["Konnect"]).map((e) => e.cle);
    expect(talk).toContain("INTERFACAGE_TELEPHONIQUE");
    expect(talk).not.toContain("INTEGRATION_SITE_WEB");
    expect(konnect).toContain("INTEGRATION_SITE_WEB");
    expect(konnect).not.toContain("INTERFACAGE_TELEPHONIQUE");
    expect(konnect).toContain("FORMATION_SECRETAIRES");
  });
  it("réunit les étapes de plusieurs produits, sans doublon, dans l'ordre de la check-list", () => {
    const cles = etapesDeclarables(["LyraeTalk", "Konnect"]).map((e) => e.cle);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles).toEqual(CHECKLIST.map((e) => e.cle).filter((cle) => cles.includes(cle)));
    expect(cles).toEqual(expect.arrayContaining(["INTERFACAGE_TELEPHONIQUE", "INTEGRATION_SITE_WEB", "PASSAGE_PRODUCTION"]));
  });
  it("ne propose rien sans produit", () => {
    expect(etapesDeclarables([])).toEqual([]);
  });
});

describe("etapesParDefaut", () => {
  it("coche tout pour un centre en service", () => {
    expect(etapesParDefaut("EN_PRODUCTION", ["LyraeTalk"])).toEqual(etapesDeclarables(["LyraeTalk"]).map((e) => e.cle));
  });
  it("ne coche rien pour un client signé ou en mise en service", () => {
    expect(etapesParDefaut("SIGNE", ["LyraeTalk"])).toEqual([]);
    expect(etapesParDefaut("EN_INTEGRATION", ["LyraeTalk"])).toEqual([]);
  });
});

describe("repartirEtapes", () => {
  it("répartit une étape commune entre les produits, et une étape propre à son seul produit", () => {
    const { parProduit, automatiques, sansObjet } = repartirEtapes(["PASSAGE_PRODUCTION", "INTEGRATION_SITE_WEB", "PASSAGE_PRODUCTION"], ["LyraeTalk", "Konnect"]);
    expect(parProduit.get("LyraeTalk")).toEqual(["PASSAGE_PRODUCTION"]);
    expect(parProduit.get("Konnect")).toEqual(["PASSAGE_PRODUCTION", "INTEGRATION_SITE_WEB"]);
    expect(automatiques).toEqual([]);
    expect(sansObjet).toEqual([]);
  });
  it("met à part une étape automatique", () => {
    expect(repartirEtapes(["MAPPING_EXAMENS", "TEST_CRENEAUX"], ["LyraeTalk"]).automatiques).toEqual(["MAPPING_EXAMENS"]);
  });
  it("met à part une étape sans objet pour ces produits", () => {
    const { parProduit, sansObjet } = repartirEtapes(["INTEGRATION_SITE_WEB"], ["LyraeTalk"]);
    expect(sansObjet).toEqual(["INTEGRATION_SITE_WEB"]);
    expect(parProduit.get("LyraeTalk")).toEqual([]);
  });
});

describe("resumeReprise", () => {
  it("compte ce qui reste", () => {
    expect(resumeReprise({ comptes: 2, contrats: 1 })).toBe("2 comptes à relier · 1 contrat à saisir");
    expect(resumeReprise({ comptes: 1, contrats: 0 })).toBe("1 compte à relier");
    expect(resumeReprise({ comptes: 0, contrats: 3 })).toBe("3 contrats à saisir");
  });
  it("dit quand tout est fait", () => {
    expect(resumeReprise({ comptes: 0, contrats: 0 })).toBe("Tout est relié.");
  });
});

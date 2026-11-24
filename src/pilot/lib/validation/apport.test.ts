import { describe, expect, it } from "vitest";
import { PRIX_DE_LA_GRILLE, champsParametres } from "./apport";

describe("les réglages de l'apport d'affaires : les prix viennent de la grille tarifaire (lot S)", () => {
  it.each(["talkTtcCentimes", "konnectTtcCentimes", "connecteurRisPdm", "installationTalkCentimes", "installationKonnectCentimes", "modeInstallation"])(
    "refuse dès la validation la clé de prix %s, et dit où la modifier", (cle) => {
      const r = champsParametres.safeParse({ [cle]: cle === "modeInstallation" ? "site" : 100 });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe(PRIX_DE_LA_GRILLE);
    });
  it("refuse une clé de prix même mêlée à des réglages permis", () => {
    expect(champsParametres.safeParse({ seuil1Centimes: 100, talkTtcCentimes: 32500 }).success).toBe(false);
  });
  it("le message est celui que la route affiche : il commence par « La », que `corps` reconnaît", () => {
    expect(PRIX_DE_LA_GRILLE).toBe("La grille tarifaire fixe les prix. Modifiez-les sur la page Tarifs.");
    expect(/^(Le |La |Date|Mois|Chiffres)/.test(PRIX_DE_LA_GRILLE)).toBe(true);
  });
  it("garde les autres réglages : TVA affichée, paliers, délais", () => {
    expect(champsParametres.safeParse({ tvaPdm: 2000, seuil1Centimes: 400000, seuil2Centimes: 1250000, taux1Pdm: 250, delaiPaiementJours: 15 }).success).toBe(true);
    expect(champsParametres.safeParse({ seuil1Centimes: 500, seuil2Centimes: 100 }).success).toBe(false);
    expect(champsParametres.safeParse({ inconnu: 1 }).success).toBe(false);
  });
});

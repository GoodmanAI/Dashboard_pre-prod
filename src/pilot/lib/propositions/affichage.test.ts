import { describe, expect, it } from "vitest";
import type { CrmTypeLigne } from "@prisma/client";
import {
  aideType, estAChiffrer, libelleLigne, messageAChiffrer, phraseAChiffrer, phraseGeste, phraseUsage, recapitulatif, resumeGestes, resumeGestesVente,
} from "./affichage";
import { totauxProposition, type LigneMontant } from "./regles";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");
const ligne = (type: CrmTypeLigne, montantCentimes: number, plus: Partial<LigneMontant> = {}): LigneMontant => ({ type, montantCentimes, ...plus });

describe("recapitulatif : brut, remise, gestes et net, par famille", () => {
  it("une proposition simple : l'abonnement par mois, l'installation une fois, au centime", () => {
    const sections = recapitulatif(totauxProposition([ligne("ABONNEMENT", 54166), ligne("MISE_EN_SERVICE", 62500)], 100));
    expect(sections.map((s) => [s.cle, s.titre, s.suite])).toEqual([
      ["mensuel", "Abonnement", "par mois"], ["uneFois", "Installation et prestations", "facturées une fois"],
    ]);
    // Remise de 10 % : 54 166 donne 48 749,4 arrondi à 48 749 ; 62 500 donne 56 250.
    expect(sections[0].lignes.map((l) => [l.libelle, nbsp(l.montant)])).toEqual([
      ["Brut", "541,66 €"], ["Remise", "-54,17 €"], ["Net", "487,49 €"],
    ]);
    expect(sections[1].lignes.map((l) => [l.libelle, nbsp(l.montant)])).toEqual([
      ["Brut", "625,00 €"], ["Remise", "-62,50 €"], ["Net", "562,50 €"],
    ]);
  });
  it("une ligne offerte garde son brut : le geste a sa ligne, le net ne la compte pas", () => {
    const sections = recapitulatif(totauxProposition([ligne("ABONNEMENT", 27083), ligne("ABONNEMENT", 27083, { offerte: true }), ligne("MISE_EN_SERVICE", 62500, { offerte: true })], 0));
    expect(sections[0].lignes.map((l) => [l.libelle, nbsp(l.montant)])).toEqual([
      ["Brut", "541,66 €"], ["Gestes commerciaux", "-270,83 €"], ["Net", "270,83 €"],
    ]);
    expect(sections[1].lignes.map((l) => [l.libelle, nbsp(l.montant)])).toEqual([
      ["Brut", "625,00 €"], ["Gestes commerciaux", "-625,00 €"], ["Net", "0,00 €"],
    ]);
  });
  it("sans remise ni geste, ni l'une ni l'autre n'a de ligne", () => {
    const [mensuel] = recapitulatif(totauxProposition([ligne("ABONNEMENT", 10000)], 0));
    expect(mensuel.lignes.map((l) => l.libelle)).toEqual(["Brut", "Net"]);
  });
  it("une prestation se compte à part dans la famille facturée une fois", () => {
    const sections = recapitulatif(totauxProposition([ligne("PRESTATION", 120000), ligne("MISE_EN_SERVICE", 62500)], 0));
    expect(sections).toHaveLength(1);
    expect(sections[0].lignes.map((l) => [l.libelle, nbsp(l.montant)])).toEqual([
      ["Brut", "1 825,00 €"], ["Net", "1 825,00 €"], ["dont frais d'installation", "625,00 €"], ["dont prestations", "1 200,00 €"],
    ]);
  });
  it("une famille sans ligne n'apparaît pas, une version vide n'a rien à récapituler", () => {
    expect(recapitulatif(totauxProposition([], 0))).toEqual([]);
    expect(recapitulatif(totauxProposition([ligne("PRESTATION", 5000)], 0)).map((s) => s.cle)).toEqual(["uneFois"]);
  });
  it("une famille sans aucun montant n'apparaît pas : ses lignes sont signalées à chiffrer ailleurs", () => {
    expect(recapitulatif(totauxProposition([ligne("ABONNEMENT", 0)], 0))).toEqual([]);
  });
  it("brut = net + remise + gestes, au centime, sur plusieurs lignes arrondies une à une", () => {
    const lignes = [ligne("ABONNEMENT", 27083), ligne("ABONNEMENT", 7917, { offerte: true }), ligne("ABONNEMENT", 33333), ligne("MISE_EN_SERVICE", 37501)];
    const totaux = totauxProposition(lignes, 125);
    for (const famille of ["mensuel", "uneFois"] as const) {
      const p = totaux.parType[famille];
      expect(p.brutCentimes).toBe(p.netCentimes + p.remiseCentimes + p.gestesCentimes);
    }
    const lignesMensuel = recapitulatif(totaux)[0].lignes;
    expect(lignesMensuel.map((l) => l.libelle)).toEqual(["Brut", "Remise", "Gestes commerciaux", "Net"]);
  });
});

describe("phraseUsage : la part à l'usage", () => {
  it("dit le prix par unité et le volume inclus", () => {
    expect(nbsp(phraseUsage({ unite: "APPEL_TRAITE", prixNetCentimes: 35, volumeInclus: 200, offerte: false }))).toBe("0,35 € par appel traité au-delà de 200");
    expect(nbsp(phraseUsage({ unite: "SMS_ENVOYE", prixNetCentimes: 8, volumeInclus: null, offerte: false }))).toBe("0,08 € par SMS envoyé");
  });
  it("une part offerte se lit « Offert »", () => {
    expect(phraseUsage({ unite: "RDV_PRIS", prixNetCentimes: 0, volumeInclus: null, offerte: true })).toBe("Offert par rendez-vous pris");
  });
});

describe("gestes commerciaux, en clair", () => {
  it("sans libellé, le geste se dit d'après le type de la ligne", () => {
    expect(phraseGeste({ type: "MISE_EN_SERVICE", libelle: null })).toBe("Installation offerte");
    expect(phraseGeste({ type: "ABONNEMENT", libelle: null })).toBe("Abonnement offert");
    expect(phraseGeste({ type: "PRESTATION", libelle: null })).toBe("Prestation offerte");
    expect(phraseGeste({ type: "PART_VARIABLE", libelle: null })).toBe("Part à l'usage offerte");
  });
  it("avec un libellé, le geste le reprend, sans répéter « offert » s'il le dit déjà", () => {
    expect(phraseGeste({ type: "ABONNEMENT", libelle: "Talk, une salle offerte" })).toBe("Talk, une salle offerte");
    expect(phraseGeste({ type: "MISE_EN_SERVICE", libelle: "Installation et formation Talk" })).toBe("Installation et formation Talk offerte");
    expect(phraseGeste({ type: "ABONNEMENT", libelle: "Konnect" })).toBe("Konnect offert");
  });
  it("un geste sans valeur affichée qui se dit inclus reste tel quel", () => {
    expect(phraseGeste({ type: "PRESTATION", libelle: "Formation incluse" })).toBe("Formation incluse");
    expect(phraseGeste({ type: "PRESTATION", libelle: "Paramétrage inclus" })).toBe("Paramétrage inclus");
  });
  it("résume les gestes d'un contrat ou d'une version : seules les lignes offertes, sans doublon", () => {
    const lignes = [
      { type: "ABONNEMENT" as const, libelle: null, offerte: false }, { type: "MISE_EN_SERVICE" as const, libelle: null, offerte: true },
      { type: "MISE_EN_SERVICE" as const, libelle: null, offerte: true }, { type: "ABONNEMENT" as const, libelle: "Talk, une salle offerte", offerte: true },
    ];
    expect(resumeGestes(lignes)).toEqual(["Installation offerte", "Talk, une salle offerte"]);
    expect(resumeGestes([{ type: "ABONNEMENT", libelle: null, offerte: false }, { type: "ABONNEMENT", libelle: null }])).toEqual([]);
  });
  it("la phrase d'une fiche ou d'une vente liste les gestes, ou dit qu'il n'y en a pas", () => {
    expect(resumeGestesVente([{ type: "MISE_EN_SERVICE", libelle: null, offerte: true }, { type: "ABONNEMENT", libelle: "Talk, une salle offerte", offerte: true }]))
      .toBe("Gestes commerciaux : installation offerte, Talk, une salle offerte.");
    expect(resumeGestesVente([{ type: "ABONNEMENT", libelle: null, offerte: false }])).toBeNull();
  });
});

describe("aideType", () => {
  it("dit chaque mois ou une fois, selon le type", () => {
    expect(aideType("ABONNEMENT")).toBe("Facturé chaque mois.");
    expect(aideType("MISE_EN_SERVICE")).toBe("Facturés une fois.");
    expect(aideType("PRESTATION")).toBe("Facturée une fois.");
    expect(aideType("PART_VARIABLE")).toBe("Facturée selon l'usage.");
  });
});

describe("libelleLigne et prix à renseigner", () => {
  it("le libellé de la ligne, sinon celui de son type", () => {
    expect(libelleLigne({ type: "PRESTATION", libelle: "Vente de RIS" })).toBe("Vente de RIS");
    expect(libelleLigne({ type: "MISE_EN_SERVICE", libelle: null })).toBe("Frais d'installation");
    expect(libelleLigne({ type: "PRESTATION", libelle: "  " })).toBe("Prestation");
  });
  it("une ligne à 0 qui n'est pas offerte est une ligne à chiffrer, une ligne offerte non", () => {
    expect(estAChiffrer({ montantCentimes: 0, offerte: false, type: "ABONNEMENT" })).toBe(true);
    expect(estAChiffrer({ montantCentimes: 0, type: "MISE_EN_SERVICE" })).toBe(true);
    expect(estAChiffrer({ montantCentimes: 0, type: "PRESTATION" })).toBe(true);
    expect(estAChiffrer({ montantCentimes: 0, offerte: true, type: "ABONNEMENT" })).toBe(false);
    expect(estAChiffrer({ montantCentimes: 27083, offerte: false, type: "ABONNEMENT" })).toBe(false);
  });
  it("la part à l'usage à 0 est un choix (un volume inclus, rien au-delà) : jamais à chiffrer", () => {
    expect(estAChiffrer({ montantCentimes: 0, offerte: false, type: "PART_VARIABLE" })).toBe(false);
    expect(estAChiffrer({ montantCentimes: 0, type: "PART_VARIABLE" })).toBe(false);
  });
  it("la phrase dit combien de lignes restent à chiffrer et quoi faire", () => {
    expect(phraseAChiffrer(0)).toBeNull();
    expect(phraseAChiffrer(1)).toBe("1 ligne est à 0 € sans être offerte. Chiffrez-la, ou cochez Offert ; indiquez son prix pour montrer ce que vous offrez. La version ne s'envoie pas avant.");
    expect(phraseAChiffrer(3)).toBe("3 lignes sont à 0 € sans être offertes. Chiffrez-les, ou cochez Offert ; indiquez leur prix pour montrer ce que vous offrez. La version ne s'envoie pas avant.");
  });
  it("le refus d'envoi dit combien de lignes et quoi faire, sans supposer d'où vient le 0", () => {
    expect(messageAChiffrer(2)).toBe("2 lignes sont à 0 € sans être offertes. Chiffrez-les, ou cochez Offert ; indiquez leur prix pour montrer ce que vous offrez.");
    expect(messageAChiffrer(1)).toBe("1 ligne est à 0 € sans être offerte. Chiffrez-la, ou cochez Offert ; indiquez son prix pour montrer ce que vous offrez.");
    expect(messageAChiffrer(2)).not.toMatch(/grille/);
  });
  it("sur un contrat, la même phrase sans le prix d'une ligne offerte (elle y est à 0)", () => {
    expect(messageAChiffrer(1, "contrat")).toBe("1 ligne est à 0 € sans être offerte. Chiffrez-la, ou cochez Offert.");
    expect(messageAChiffrer(3, "contrat")).toBe("3 lignes sont à 0 € sans être offertes. Chiffrez-les, ou cochez Offert.");
  });
});

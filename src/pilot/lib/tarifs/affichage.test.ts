import { describe, expect, it } from "vitest";
import {
  INVITATION_PRIX, PRIX_A_RENSEIGNER, aideTarifARenseigner, droitsGrille, formaterPourcentage, jourFr, libelleBase, montantTarif,
  phraseGrille, phraseGrilleSansTarif, phraseSuppressionGrille, saisieTaux, tarifsARenseigner, tauxDepuisSaisie, titreGrille,
} from "./affichage";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("libelleBase : la base d'un tarif, en clair", () => {
  it("un abonnement se dit par mois, une installation ou une prestation une fois", () => {
    expect(libelleBase({ type: "ABONNEMENT", base: "PAR_SALLE", pourMille: null })).toBe("par salle et par mois");
    expect(libelleBase({ type: "MISE_EN_SERVICE", base: "PAR_SITE", pourMille: null })).toBe("par site, une fois");
    expect(libelleBase({ type: "MISE_EN_SERVICE", base: "PAR_SALLE", pourMille: null })).toBe("par salle, une fois");
    expect(libelleBase({ type: "PRESTATION", base: "PAR_ORGANISATION", pourMille: null })).toBe("par organisation, une fois");
    expect(libelleBase({ type: "ABONNEMENT", base: "PAR_ORGANISATION", pourMille: null })).toBe("par organisation et par mois");
    expect(libelleBase({ type: "ABONNEMENT", base: "PAR_SITE", pourMille: null })).toBe("par site et par mois");
  });
  it("un pourcentage dit son taux et ce sur quoi il porte", () => {
    expect(libelleBase({ type: "ABONNEMENT", base: "POURCENTAGE", pourMille: 150 })).toBe("15 % du montant des salles");
    expect(libelleBase({ type: "ABONNEMENT", base: "POURCENTAGE", pourMille: 125 })).toBe("12,5 % du montant des salles");
    expect(libelleBase({ type: "ABONNEMENT", base: "POURCENTAGE", pourMille: null })).toBe("Pourcentage du montant des salles");
  });
});

describe("montantTarif : le prix hors taxe, ou ce qui manque", () => {
  it("un prix vide se lit « Prix à renseigner », jamais 0 €", () => {
    expect(montantTarif({ base: "PAR_SALLE", montantHtCentimes: null })).toBe(PRIX_A_RENSEIGNER);
    expect(nbsp(montantTarif({ base: "PAR_SALLE", montantHtCentimes: 0 }))).toBe("0,00 €");
  });
  it("un prix se lit au centime", () => {
    expect(nbsp(montantTarif({ base: "PAR_SALLE", montantHtCentimes: 27083 }))).toBe("270,83 €");
    expect(nbsp(montantTarif({ base: "PAR_SITE", montantHtCentimes: 62500 }))).toBe("625,00 €");
  });
  it("un pourcentage n'a pas de prix : il dit d'où le montant vient", () => {
    expect(montantTarif({ base: "POURCENTAGE", montantHtCentimes: null })).toBe("Selon les salles");
  });
});

describe("tarifsARenseigner", () => {
  it("ne retient que les prix vides, pas un pourcentage", () => {
    const tarifs = [
      { code: "TALK", base: "PAR_SALLE" as const, montantHtCentimes: 27083 }, { code: "DESK", base: "PAR_SALLE" as const, montantHtCentimes: null },
      { code: "CONNECTEUR_RIS", base: "POURCENTAGE" as const, montantHtCentimes: null }, { code: "GRATUIT", base: "PAR_SITE" as const, montantHtCentimes: 0 },
    ];
    expect(tarifsARenseigner(tarifs).map((t) => t.code)).toEqual(["DESK"]);
  });
  it("l'invitation à renseigner le prix est une phrase entière", () => {
    expect(INVITATION_PRIX).toBe("Renseignez ce prix pour qu'il entre dans les propositions préremplies.");
  });
});

describe("taux en pourcentage", () => {
  it("s'écrit comme on le saisit et se relit exactement, en pour-mille entier", () => {
    expect(saisieTaux(150)).toBe("15");
    expect(saisieTaux(125)).toBe("12,5");
    expect(saisieTaux(5)).toBe("0,5");
    expect(saisieTaux(0)).toBe("0");
    expect(tauxDepuisSaisie("15")).toBe(150);
    expect(tauxDepuisSaisie("12,5")).toBe(125);
    expect(tauxDepuisSaisie("12.5")).toBe(125);
    expect(tauxDepuisSaisie("100")).toBe(1000);
  });
  it("tous les taux de 0 à 100 % passent aller-retour, sans flottant", () => {
    for (let n = 0; n <= 1000; n++) expect(tauxDepuisSaisie(saisieTaux(n))).toBe(n);
  });
  it("refuse ce qui n'est pas un taux entre 0 et 100 %", () => {
    expect(() => tauxDepuisSaisie("101")).toThrow("Vérifiez le champ « Taux en pourcentage ».");
    expect(() => tauxDepuisSaisie("12,55")).toThrow("Taux en pourcentage");
    expect(() => tauxDepuisSaisie("")).toThrow("Taux en pourcentage");
    expect(() => tauxDepuisSaisie("-3")).toThrow("Taux en pourcentage");
  });
  it("formaterPourcentage écrit le pour-mille", () => {
    expect(formaterPourcentage(150)).toBe("15 %");
    expect(formaterPourcentage(1000)).toBe("100 %");
    expect(formaterPourcentage(5)).toBe("0,5 %");
  });
});

describe("phrases de grille", () => {
  it("jourFr écrit JJ/MM/AAAA", () => { expect(jourFr("2026-11-18")).toBe("18/11/2026"); });
  it("le titre porte la date, le statut dit où elle en est", () => {
    expect(titreGrille("2026-11-18")).toBe("Grille du 18/11/2026");
    expect(phraseGrille("EN_VIGUEUR", "2026-11-18")).toBe("En vigueur depuis le 18/11/2026");
    expect(phraseGrille("PROCHAINE", "2027-01-01")).toBe("Prochaine grille, applicable à partir du 01/01/2027");
    expect(phraseGrille("PASSEE", "2026-01-01")).toBe("Ancienne grille, appliquée à partir du 01/01/2026");
  });
});

describe("aideTarifARenseigner : toute case vide dit comment la remplir", () => {
  it("avec le droit sur une grille libre : l'invitation", () => {
    expect(aideTarifARenseigner({ modifier: true, copier: true })).toBe(INVITATION_PRIX);
  });
  it("sur une grille utilisée : créer une nouvelle grille datée", () => {
    expect(aideTarifARenseigner({ modifier: false, copier: true })).toContain("Créez une nouvelle grille datée");
  });
  it("sans le droit : à qui le demander", () => {
    expect(aideTarifARenseigner({ modifier: false, copier: false })).toContain("Demandez à un compte");
  });
});

describe("droitsGrille : ce qu'on peut faire d'une grille, et pourquoi pas", () => {
  const libre = { statut: "EN_VIGUEUR" as const, modifiable: true, raison: null };
  it("sans le droit de modifier les montants : lecture seule, une phrase le dit, aucun bouton", () => {
    const d = droitsGrille(libre, false);
    expect(d).toMatchObject({ modifier: false, copier: false });
    expect(d.phrase).toContain("Modifier les montants");
  });
  it("une grille en vigueur ou à venir que rien n'utilise se modifie", () => {
    expect(droitsGrille(libre, true)).toEqual({ modifier: true, copier: true, phrase: null });
    expect(droitsGrille({ ...libre, statut: "PROCHAINE" }, true)).toEqual({ modifier: true, copier: true, phrase: null });
  });
  it("une grille utilisée dit pourquoi on ne la modifie plus et propose d'en créer une nouvelle", () => {
    const raison = "Cette grille sert déjà à 2 propositions. Créez une nouvelle grille datée pour changer un prix.";
    expect(droitsGrille({ statut: "EN_VIGUEUR", modifiable: false, raison }, true)).toEqual({ modifier: false, copier: true, phrase: raison });
  });
  it("une ancienne grille ne se modifie pas, même si rien ne l'utilise", () => {
    const d = droitsGrille({ statut: "PASSEE", modifiable: true, raison: null }, true);
    expect(d).toMatchObject({ modifier: false, copier: true });
    expect(d.phrase).toContain("n'est plus en vigueur");
  });
});

describe("phraseGrilleSansTarif : une grille vide dit quand elle s'appliquerait sans prix", () => {
  it("à venir, la date à laquelle elle s'appliquerait sans aucun prix", () => {
    expect(phraseGrilleSansTarif("PROCHAINE", "2027-01-01", true)).toBe("Cette grille n'a aucun tarif. Elle s'appliquera le 01/01/2027 sans aucun prix. Ajoutez-en avec « Ajouter un tarif ».");
    expect(phraseGrilleSansTarif("PROCHAINE", "2027-01-01", false)).toBe("Cette grille n'a aucun tarif. Elle s'appliquera le 01/01/2027 sans aucun prix.");
  });
  it("en vigueur ou passée, pas de date à annoncer", () => {
    expect(phraseGrilleSansTarif("EN_VIGUEUR", "2026-01-01", true)).toBe("Cette grille n'a aucun tarif. Ajoutez-en avec « Ajouter un tarif ».");
    expect(phraseGrilleSansTarif("PASSEE", "2025-01-01", false)).toBe("Cette grille n'a aucun tarif.");
  });
});

describe("phraseSuppressionGrille : accordée au nombre de tarifs, jamais « ses 1 tarifs »", () => {
  it("aucun, un ou plusieurs tarifs", () => {
    expect(phraseSuppressionGrille("2027-01-01", 0)).toBe("La grille du 01/01/2027 sera supprimée.");
    expect(phraseSuppressionGrille("2027-01-01", 1)).toBe("La grille du 01/01/2027 et son tarif seront supprimés.");
    expect(phraseSuppressionGrille("2027-01-01", 7)).toBe("La grille du 01/01/2027 et ses 7 tarifs seront supprimés.");
  });
});

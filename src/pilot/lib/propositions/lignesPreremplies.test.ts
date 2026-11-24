import { describe, expect, it } from "vitest";
import { expliquerRemarque, type LignePreremplie, type Preremplissage } from "@/pilot/lib/tarifs/preremplir";
import { MESSAGE_TROP_DE_LIGNES, MESSAGE_MONTANT_TROP_ELEVE, RefusPreremplissage, messageAucuneLigne, preparerLignes } from "./lignesPreremplies";

const ligne = (surcharge: Partial<LignePreremplie> = {}): LignePreremplie => ({
  code: "TALK", productId: 1, libelle: "Talk", type: "ABONNEMENT", montantCentimes: 81249, centreId: 7, prixARenseigner: false, offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null, ...surcharge,
});
const prerempli = (lignes: LignePreremplie[], remarques: Preremplissage["remarques"] = []): Preremplissage => ({ lignes, remarques });

describe("les lignes d'une version préremplie", () => {
  it("chaque ligne devient une ligne de proposition : produit, centre, type, brut, libellé, jamais offerte", () => {
    const r = preparerLignes(prerempli([ligne(), ligne({ code: "CONNECTEUR_RIS", productId: null, libelle: "Connecteur RIS", montantCentimes: 12187 })]));
    expect(r.refus).toBeNull();
    expect(r.lignes).toEqual([
      { productId: 1, centreId: 7, type: "ABONNEMENT", montantCentimes: 81249, libelle: "Talk", offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null },
      { productId: null, centreId: 7, type: "ABONNEMENT", montantCentimes: 12187, libelle: "Connecteur RIS", offerte: false, quantite: null, prixUnitaireCentimes: null, baseQuantite: null },
    ]);
  });
  it("une ligne sans centre (installation par organisation) reste sans centre", () => {
    expect(preparerLignes(prerempli([ligne({ centreId: null, type: "MISE_EN_SERVICE", montantCentimes: 62500 })])).lignes[0].centreId).toBeNull();
  });
  it("garde, dans l'ordre des lignes, celles dont le prix est à renseigner : l'écran le signale", () => {
    const r = preparerLignes(prerempli([ligne(), ligne({ montantCentimes: 0, prixARenseigner: true }), ligne({ montantCentimes: 500 })]));
    expect(r.aRenseigner).toEqual([false, true, false]);
    expect(r.lignes[1].montantCentimes).toBe(0);
  });
  it("chaque remarque garde sa phrase : l'écran dit pourquoi une ligne manque", () => {
    const remarques: Preremplissage["remarques"] = [{ code: "CENTRE_SANS_SALLE", centreId: 3, tarif: null }, { code: "TARIF_ABSENT", centreId: null, tarif: "CONNECTEUR_RIS" }];
    const r = preparerLignes(prerempli([ligne()], remarques));
    // Des lignes vont être écrites : la grille sera figée, le conseil vise une nouvelle grille datée.
    expect(r.remarques).toEqual(remarques.map((x) => ({ ...x, message: expliquerRemarque(x, { grilleFigee: true }) })));
    expect(r.remarques[0].message).toContain("Ce centre n'a aucune salle");
    expect(r.remarques[1].message).toMatch(/dans une nouvelle grille datée\.$/);
  });
  it("les remarques nomment le centre, d'après les noms chargés avec les centres", () => {
    const r = preparerLignes({ ...prerempli([ligne()], [{ code: "CENTRE_SANS_SALLE", centreId: 3, tarif: null }]), nomsCentres: new Map([[3, "Site principal"]]) });
    expect(r.remarques[0].message).toBe("Le centre Site principal n'a aucune salle. Ajoutez ses salles pour chiffrer ses lignes.");
  });
  it("sans ligne, la grille n'est figée que si une proposition s'en sert déjà", () => {
    const absent = [{ code: "TARIF_ABSENT" as const, centreId: null, tarif: "KONNECT" }];
    expect(preparerLignes(prerempli([], absent)).remarques[0].message).not.toMatch(/nouvelle grille/);
    expect(preparerLignes({ ...prerempli([], absent), grilleUtilisee: true }).remarques[0].message).toMatch(/dans une nouvelle grille datée\.$/);
  });
  it("sans ligne, rien à créer ni à remplacer : un refus qui reprend les remarques", () => {
    const r = preparerLignes(prerempli([], [{ code: "AUCUNE_GRILLE", centreId: null, tarif: null }]));
    expect(r).toMatchObject({ lignes: [], aRenseigner: [] });
    expect(r.remarques[0].message).toContain("Aucune grille tarifaire en vigueur");
    expect(r.refus).toBe(`La grille ne donne aucune ligne pour cette fiche. ${r.remarques[0].message}`);
  });
  it("le refus sans ligne enchaîne les remarques, chaque phrase une fois, ou dit quoi vérifier s'il n'y en a pas", () => {
    expect(messageAucuneLigne([{ message: "Un." }, { message: "Deux." }])).toBe("La grille ne donne aucune ligne pour cette fiche. Un. Deux.");
    expect(messageAucuneLigne([{ message: "Un." }, { message: "Deux." }, { message: "Un." }])).toBe("La grille ne donne aucune ligne pour cette fiche. Un. Deux.");
    expect(messageAucuneLigne([])).toBe("La grille ne donne aucune ligne pour cette fiche. Vérifiez les centres, leurs salles et leurs offres.");
  });
  it("le refus porte ses remarques et le statut 400", () => {
    const remarques = [{ code: "AUCUN_CENTRE" as const, centreId: null, tarif: null, message: "Aucun centre." }];
    const refus = new RefusPreremplissage("Refus.", remarques);
    expect(refus.statut).toBe(400);
    expect(refus.remarques).toBe(remarques);
    expect(refus.message).toBe("Refus.");
  });
  it("refuse plus de 50 lignes : la proposition n'en porte pas davantage", () => {
    expect(preparerLignes(prerempli(Array.from({ length: 50 }, () => ligne()))).refus).toBeNull();
    expect(preparerLignes(prerempli(Array.from({ length: 51 }, () => ligne()))).refus).toBe(MESSAGE_TROP_DE_LIGNES(51));
  });
  it("le refus du nombre de lignes dit quoi faire", () => {
    expect(MESSAGE_TROP_DE_LIGNES(51)).toBe("Le préremplissage donnerait 51 lignes, une proposition en porte 50 au plus. Saisissez les lignes à la main avec « Ajouter une ligne », en regroupant des centres sur une ligne « Toute l'organisation ».");
    expect(MESSAGE_TROP_DE_LIGNES(51)).not.toMatch(/version vide/);
  });
  it("refuse un montant au-dessus de la limite d'une ligne, plutôt que de laisser la version impossible à modifier", () => {
    expect(preparerLignes(prerempli([ligne({ montantCentimes: 100000000 })])).refus).toBeNull();
    expect(preparerLignes(prerempli([ligne({ montantCentimes: 100000001 })])).refus).toBe(MESSAGE_MONTANT_TROP_ELEVE);
  });
});

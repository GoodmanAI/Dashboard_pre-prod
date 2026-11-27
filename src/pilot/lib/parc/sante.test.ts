import { describe, expect, it } from "vitest";
import { production, resumeParc, santeCentre, tendance, trierParGravite, type CouleurFeu, type SanteCentre } from "./sante";
import type { UsageCentre } from "./usage";

const maintenant = new Date("2026-11-10T12:00:00.000Z");
const HEURE = 3600000;
/** Quatre semaines égales : la tendance est stable et seul le volume compte. */
const reguliere = (appels: number, rdv = 0): UsageCentre => {
  const s = appels / 4;
  return { semaines: [s, s, s, s], appels, rdv };
};
const sante = (champs: Partial<Parameters<typeof santeCentre>[0]> = {}) => santeCentre({
  volumeAnnonceParJour: 10, usage: reguliere(280, 84), dernierAppelLe: new Date(maintenant.getTime() - HEURE),
  ticketsOuverts: null, deskPart: null, maintenant, ...champs,
});

describe("usage contre volume annoncé", () => {
  // 10 appels par jour annoncés : 280 sur 28 jours font 100 %.
  it.each([[224, "vert", 80], [223, "orange", 79], [140, "orange", 50], [139, "rouge", 49], [0, "rouge", 0]] as const)(
    "%i appels sur 28 jours", (appels, couleur, pourcentage) => {
      const u = appels ? reguliere(appels) : { semaines: [0, 0, 0, 0] as UsageCentre["semaines"], appels: 0, rdv: 0 };
      const feu = sante({ usage: u }).usage;
      expect(feu.couleur).toBe(couleur);
      expect(feu.raison.startsWith(`${pourcentage} % du volume annoncé`)).toBe(true);
    });
  it("un feu dit son libellé et sa raison, la tendance comprise", () => {
    expect(sante({ usage: { semaines: [80, 80, 60, 60], appels: 280, rdv: 0 } }).usage)
      .toEqual({ couleur: "orange", libelle: "Volume d'appels", raison: "100 % du volume annoncé, en baisse de 25 %." });
    expect(sante().usage.raison).toBe("100 % du volume annoncé, stable.");
    expect(sante({ usage: { semaines: [0, 0, 0, 0], appels: 0, rdv: 0 } }).usage.raison).toBe("0 % du volume annoncé, aucun appel sur 4 semaines.");
  });
  it("une baisse de plus de 20 % fait passer un vert à orange, jamais un rouge à orange", () => {
    expect(sante({ usage: { semaines: [100, 100, 79, 79], appels: 358, rdv: 0 } }).usage.couleur).toBe("orange");
    expect(sante({ usage: { semaines: [100, 100, 80, 80], appels: 360, rdv: 0 } }).usage.couleur).toBe("vert");
    expect(sante({ usage: { semaines: [40, 40, 10, 10], appels: 100, rdv: 0 } }).usage.couleur).toBe("rouge");
  });
  it("le volume de l'organisation se répartit entre ses centres en service", () => {
    const feu = sante({ volumeAnnonceParJour: 20, centresEnProduction: 2 }).usage;
    expect(feu).toMatchObject({ couleur: "vert", raison: "100 % du volume annoncé, stable. Volume annoncé de l'organisation, réparti sur 2 centres." });
    expect(sante({ volumeAnnonceParJour: 30, centresEnProduction: 3, usage: reguliere(140) }).usage.raison.startsWith("50 % du volume annoncé")).toBe(true);
  });
  it("sans volume annoncé, gris mais la tendance s'affiche", () => {
    for (const volumeAnnonceParJour of [null, 0]) {
      expect(sante({ volumeAnnonceParJour, usage: { semaines: [10, 10, 20, 20], appels: 60, rdv: 0 } }).usage)
        .toEqual({ couleur: "gris", libelle: "Volume d'appels", raison: "Volume annoncé non renseigné, en hausse de 100 %." });
    }
    expect(sante({ volumeAnnonceParJour: null, usage: { semaines: [0, 0, 0, 0], appels: 0, rdv: 0 } }).usage.raison)
      .toBe("Volume annoncé non renseigné, aucun appel sur 4 semaines.");
  });
});

describe("tendance", () => {
  it("hausse, baisse, stable à moins de 5 %, signée et entière", () => {
    expect(tendance([10, 10, 15, 15])).toEqual({ pourcentage: 50, texte: "en hausse de 50 %" });
    expect(tendance([10, 10, 7, 8])).toEqual({ pourcentage: -25, texte: "en baisse de 25 %" });
    expect(tendance([50, 50, 52, 52])).toEqual({ pourcentage: 4, texte: "stable" });
    expect(tendance([50, 50, 48, 48])).toEqual({ pourcentage: -4, texte: "stable" });
    expect(tendance([50, 50, 47, 48])).toEqual({ pourcentage: -5, texte: "en baisse de 5 %" });
    expect(tendance([3, 0, 1, 1])).toEqual({ pourcentage: -33, texte: "en baisse de 33 %" });
  });
  it("première semaine vide, puis les deux premières : aucune division par zéro", () => {
    expect(tendance([0, 10, 5, 5])).toEqual({ pourcentage: 0, texte: "stable" });
    expect(tendance([0, 0, 5, 5])).toEqual({ pourcentage: null, texte: "en hausse, aucun appel les deux semaines d'avant" });
    expect(tendance([0, 0, 0, 0])).toEqual({ pourcentage: null, texte: null });
    expect(tendance([4, 4, 0, 0])).toEqual({ pourcentage: -100, texte: "en baisse de 100 %" });
  });
});

describe("RDV pris", () => {
  it.each([[30, "vert"], [29, "orange"], [15, "orange"], [14, "rouge"], [0, "rouge"]] as const)("%i RDV sur 100 appels", (rdv, couleur) => {
    expect(sante({ usage: reguliere(100, rdv) }).rdv).toEqual({ couleur, libelle: "RDV pris",
      raison: `${rdv} % des appels sur 4 semaines, ${rdv} RDV sur 100 appels.` });
  });
  it("arrondi vers zéro, et gris sans appel sur 4 semaines", () => {
    expect(sante({ usage: { semaines: [1, 0, 1, 1], appels: 3, rdv: 1 } }).rdv.raison).toBe("33 % des appels sur 4 semaines, 1 RDV sur 3 appels.");
    expect(sante({ usage: { semaines: [0, 0, 0, 0], appels: 0, rdv: 0 } }).rdv).toEqual({ couleur: "gris", libelle: "RDV pris", raison: "Aucun appel sur 4 semaines." });
  });
});

describe("incidents", () => {
  it.each([[null, "gris", "Demandes des clients illisibles pour l'instant."], [0, "vert", "Aucune demande de client ouverte."],
    [1, "orange", "1 demande de client ouverte."], [2, "orange", "2 demandes de client ouvertes."], [3, "rouge", "3 demandes de client ouvertes."]] as const)("%s ticket(s)", (ticketsOuverts, couleur, raison) => {
    expect(sante({ ticketsOuverts }).incidents).toEqual({ couleur, libelle: "Incidents", raison });
  });
  it("une source branchée sans compte Dashboard le dit", () => {
    expect(sante({ ticketsOuverts: null, compteDashboard: false }).incidents.raison).toBe("Aucun compte Dashboard associé à l'organisation.");
  });
});

describe("silence", () => {
  const silence = (heures: number | null) => sante({ dernierAppelLe: heures === null ? null : new Date(maintenant.getTime() - heures * HEURE) }).silence;
  it.each([[0.5, "vert", "moins d'une heure"], [23.9, "vert", "23 h"], [24, "orange", "24 h"], [47.9, "orange", "47 h"],
    [48, "rouge", "48 h"], [60, "rouge", "60 h"], [72, "rouge", "3 jours"], [24 * 9 + 5, "rouge", "9 jours"]] as const)("%s h", (heures, couleur, depuis) => {
    expect(silence(heures)).toEqual({ couleur, libelle: "Dernier appel", raison: `Dernier appel il y a ${depuis}.` });
  });
  it("aucun appel enregistré est rouge, un appel daté après maintenant ne compte pas en négatif", () => {
    expect(silence(null)).toEqual({ couleur: "rouge", libelle: "Dernier appel", raison: "Aucun appel enregistré." });
    expect(silence(-2).raison).toBe("Dernier appel il y a moins d'une heure.");
  });
});

describe("Desk et production", () => {
  it("Desk sans source le dit, sans chiffre", () => {
    expect(sante().desk).toEqual({ disponible: false, texte: "Desk n'est pas encore en service." });
    expect(sante({ deskPart: 40 }).desk).toEqual({ disponible: true, texte: "40 % des RDV pris dans Desk, le reste dans Xplore." });
  });
  it("Pilot ou le Dashboard suffit, la ligne dit lequel manque", () => {
    expect(production({ declaree: true, statutCentre: "EN_PRODUCTION" })).toEqual({ enProduction: true, mention: null });
    expect(production({ declaree: true, statutCentre: null })).toEqual({ enProduction: true, mention: "Déclaré dans Pilot, pas encore au Dashboard." });
    expect(production({ declaree: false, statutCentre: "EN_PRODUCTION" })).toEqual({ enProduction: true, mention: "En service sur le Dashboard, mise en service pas encore déclarée dans Pilot." });
    expect(production({ declaree: false, statutCentre: "EN_INTEGRATION" })).toEqual({ enProduction: false, mention: null });
  });
});

describe("tri par gravité et résumé", () => {
  const feu = (couleur: CouleurFeu) => ({ couleur, libelle: "", raison: "" });
  const avec = (...couleurs: CouleurFeu[]): SanteCentre => ({ usage: feu(couleurs[0]), rdv: feu(couleurs[1]), incidents: feu(couleurs[2]), silence: feu(couleurs[3]),
    desk: { disponible: false, texte: "" } });
  const ligne = (id: number, organisationNom: string, s: SanteCentre, centreNom = "Site") => ({ id, organisationNom, centreNom, produit: "LyraeTalk", sante: s });
  const lignes = [
    ligne(1, "Alpha", avec("vert", "vert", "gris", "vert")),
    ligne(2, "Beta", avec("orange", "orange", "gris", "vert")),
    ligne(3, "Gamma", avec("rouge", "vert", "gris", "vert")),
    ligne(4, "Delta", avec("rouge", "orange", "gris", "rouge")),
    ligne(5, "Alpha", avec("rouge", "vert", "gris", "orange"), "Annexe"),
    ligne(6, "Beta", avec("rouge", "vert", "gris", "orange"), "Annexe"),
  ];
  it("le plus de rouges, puis le plus d'orange, puis l'organisation et le centre", () => {
    expect(trierParGravite(lignes).map((l) => l.id)).toEqual([4, 5, 6, 3, 2, 1]);
    expect(lignes.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("résumé : chaque centre compté une fois, à son feu le plus grave", () => {
    expect(resumeParc(lignes)).toBe("6 centres en service · 4 en rouge · 1 en orange");
    expect(resumeParc([lignes[0]])).toBe("1 centre en service · rien en rouge ni en orange");
    expect(resumeParc([lignes[1]])).toBe("1 centre en service · 1 en orange");
    expect(resumeParc([])).toBe("0 centre en service");
  });
});

describe("NoShow, produit sans appel (C-56)", () => {
  it("les feux d'appels sont gris et disent pourquoi, les incidents restent lus", () => {
    const s = sante({ passeDesAppels: false, dernierAppelLe: null });
    for (const feu of [s.usage, s.rdv, s.silence]) expect(feu).toMatchObject({ couleur: "gris", raison: "Ce produit ne passe pas d'appels. Indicateur à brancher sur les rappels envoyés." });
    expect(s.silence.libelle).toBe("Dernier appel");
  });
});
